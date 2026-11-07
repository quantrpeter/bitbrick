<?php

namespace App\Http\Controllers;

use App\Models\Design;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DesignController extends Controller
{
    /** Measurement names a brick (or, for older designs, the whole part) may override. */
    public const MEASUREMENT_KEYS = [
        'gridUnit', 'subdivisionsPerQuarter', 'edgeMargin', 'cornerRadius',
        'pinHoleDiameter', 'counterboreDiameter', 'counterboreDepth', 'axleHoleSpan', 'axleHoleSize',
        'pinDiameter', 'axleSpan', 'axleArmWidth', 'ballDiameter', 'ballBaseDiameter', 'gearTeeth',
    ];

    public function index(Request $request): JsonResponse
    {
        $designs = $request->user()->designs()
            ->select(['id', 'name', 'thumbnail', 'is_public', 'share_token', 'updated_at'])
            ->latest('updated_at')
            ->get()
            ->map(fn (Design $d) => $this->summary($d));

        return response()->json(['designs' => $designs]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($request->user()->designs()->count() >= config('bitbrick.max_designs_per_user')) {
            return response()->json(['message' => 'Design limit reached. Delete an old design first.'], 422);
        }

        $design = $request->user()->designs()->create($this->validated($request));

        return response()->json($this->full($design), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json($this->full($this->owned($request, $id)));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $design = $this->owned($request, $id);
        $design->update($this->validated($request));

        return response()->json($this->full($design->refresh()));
    }

    /** Rename only: leaves the saved blocks untouched, so unsaved edits in the browser are never written by accident. */
    public function rename(Request $request, int $id): JsonResponse
    {
        $name = $request->validate(['name' => ['required', 'string', 'max:120']])['name'];
        $name = trim($name);
        if ($name === '') {
            return response()->json(['message' => 'The name cannot be blank.', 'errors' => ['name' => ['The name cannot be blank.']]], 422);
        }

        $design = $this->owned($request, $id);
        $design->name = $name;
        $design->data = array_merge($design->data ?? [], ['name' => $name]);
        $design->save();

        return response()->json($this->summary($design));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->owned($request, $id)->delete();

        return response()->json(['ok' => true]);
    }

    public function share(Request $request, int $id): JsonResponse
    {
        $token = $this->owned($request, $id)->publish();

        return response()->json(['share_token' => $token, 'url' => url('/p/'.$token)]);
    }

    public function unshare(Request $request, int $id): JsonResponse
    {
        $this->owned($request, $id)->unpublish();

        return response()->json(['ok' => true]);
    }

    /** Other users' designs are reported as 404, never 403, so ids cannot be probed. */
    private function owned(Request $request, int $id): Design
    {
        return $request->user()->designs()->findOrFail($id);
    }

    private function validated(Request $request): array
    {
        $max = (int) config('bitbrick.max_blocks');

        $v = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'data' => ['required', 'array'],
            'data.version' => ['required', 'integer', 'min:1'],
            'data.name' => ['nullable', 'string', 'max:120'],
            'data.blocks' => ['present', 'array', 'max:'.$max],
            'data.blocks.*.pos' => ['required', 'array', 'size:3'],
            'data.blocks.*.pos.*' => ['required', 'integer', 'between:-1024,1024'],
            'data.blocks.*.type' => ['required', Rule::in(['pinHole', 'axleHole', 'pin', 'axle', 'solid', 'ballJoint', 'gear'])],
            'data.blocks.*.axis' => ['required', Rule::in(['x', 'y', 'z'])],
            'data.blocks.*.size' => ['required', Rule::in(['full', 'half'])],
            'data.blocks.*.rounded' => ['required', 'boolean'],
            // Per-brick overrides (only the bricks that differ from the defaults carry any).
            'data.blocks.*.measurements' => ['nullable', 'array', 'max:16', $this->knownKeys(...)],
            'data.blocks.*.measurements.*' => ['numeric', 'between:0,1000'],
            // Older designs stored one set of overrides for the whole part; still accepted and honoured.
            'data.measurements' => ['nullable', 'array', 'max:64', $this->knownKeys(...)],
            'data.measurements.*' => ['numeric', 'between:0,1000'],
            'thumbnail' => ['nullable', 'string', 'max:300000', 'regex:#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#'],
        ]);

        // Persist only what the schema defines.
        return [
            'name' => $v['name'],
            'data' => [
                'version' => $v['data']['version'],
                'name' => $v['data']['name'] ?? $v['name'],
                'blocks' => $v['data']['blocks'],
                'measurements' => (object) ($v['data']['measurements'] ?? []),
            ],
            'schema_version' => $v['data']['version'],
            'thumbnail' => $v['thumbnail'] ?? null,
        ];
    }

    private function knownKeys(string $attribute, mixed $value, \Closure $fail): void
    {
        if (is_array($value) && array_diff(array_keys($value), self::MEASUREMENT_KEYS)) {
            $fail('Unknown measurement name.');
        }
    }

    private function summary(Design $d): array
    {
        return [
            'id' => $d->id,
            'name' => $d->name,
            'thumbnail' => $d->thumbnail,
            'is_public' => $d->is_public,
            'share_token' => $d->is_public ? $d->share_token : null,
            'updated_at' => $d->updated_at?->toIso8601String(),
        ];
    }

    private function full(Design $d): array
    {
        return $this->summary($d) + ['data' => $d->data];
    }
}
