<?php

namespace Tests\Feature;

use App\Models\Design;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DesignApiTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $over = []): array
    {
        return array_replace_recursive([
            'name' => 'Frame 5x7',
            'data' => [
                'version' => 1,
                'name' => 'Frame 5x7',
                'blocks' => [
                    ['pos' => [0, 0, 0], 'type' => 'pinHole', 'axis' => 'x', 'size' => 'full', 'rounded' => true],
                    ['pos' => [1, 0, 0], 'type' => 'axleHole', 'axis' => 'y', 'size' => 'half', 'rounded' => false],
                ],
                'measurements' => ['pinHoleDiameter' => 4.95],
            ],
        ], $over);
    }

    public function test_guests_cannot_use_the_api(): void
    {
        $this->getJson('/designer/designs')->assertUnauthorized();
        $this->postJson('/designer/designs', $this->payload())->assertUnauthorized();
    }

    public function test_create_list_show_update_delete(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $id = $this->postJson('/designer/designs', $this->payload())
            ->assertCreated()->assertJsonPath('data.blocks.1.type', 'axleHole')->json('id');

        $this->getJson('/designer/designs')->assertOk()->assertJsonCount(1, 'designs')
            ->assertJsonMissingPath('designs.0.data');

        $this->putJson("/designer/designs/$id", $this->payload(['name' => 'Renamed']))
            ->assertOk()->assertJsonPath('name', 'Renamed');

        $this->getJson("/designer/designs/$id")->assertOk()->assertJsonPath('name', 'Renamed');

        $this->deleteJson("/designer/designs/$id")->assertOk();
        $this->assertSame(0, Design::count());
    }

    public function test_user_cannot_touch_another_users_design(): void
    {
        $owner = User::factory()->create();
        $design = $owner->designs()->create(['name' => 'x', 'data' => $this->payload()['data']]);

        $this->actingAs(User::factory()->create());

        $this->getJson("/designer/designs/{$design->id}")->assertNotFound();
        $this->putJson("/designer/designs/{$design->id}", $this->payload())->assertNotFound();
        $this->deleteJson("/designer/designs/{$design->id}")->assertNotFound();
        $this->postJson("/designer/designs/{$design->id}/share")->assertNotFound();
        $this->assertSame(1, Design::count());
    }

    public function test_validation_rejects_bad_blocks(): void
    {
        $this->actingAs(User::factory()->create());

        $bad = $this->payload();
        $bad['data']['blocks'][0]['type'] = 'laser';
        $this->postJson('/designer/designs', $bad)->assertUnprocessable()
            ->assertJsonValidationErrors('data.blocks.0.type');

        $bad = $this->payload();
        $bad['data']['blocks'][0]['pos'] = [0, 0];
        $this->postJson('/designer/designs', $bad)->assertUnprocessable();

        $bad = $this->payload(['thumbnail' => 'javascript:alert(1)']);
        $this->postJson('/designer/designs', $bad)->assertUnprocessable()
            ->assertJsonValidationErrors('thumbnail');
    }

    public function test_block_count_is_capped(): void
    {
        config(['bitbrick.max_blocks' => 1]);
        $this->actingAs(User::factory()->create());

        $this->postJson('/designer/designs', $this->payload())->assertUnprocessable()
            ->assertJsonValidationErrors('data.blocks');
    }

    public function test_rename_changes_only_the_name(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $id = $this->postJson('/designer/designs', $this->payload())->json('id');

        $this->patchJson("/designer/designs/$id", ['name' => '  Better name  '])
            ->assertOk()->assertJsonPath('name', 'Better name');

        $saved = Design::findOrFail($id);
        $this->assertSame('Better name', $saved->name);
        $this->assertSame('Better name', $saved->data['name']);
        $this->assertCount(2, $saved->data['blocks'], 'blocks are untouched');
    }

    public function test_rename_validation_and_ownership(): void
    {
        $owner = User::factory()->create();
        $id = $owner->designs()->create(['name' => 'Mine', 'data' => $this->payload()['data']])->id;

        $this->actingAs($owner);
        $this->patchJson("/designer/designs/$id", ['name' => ''])->assertUnprocessable();
        $this->patchJson("/designer/designs/$id", ['name' => '   '])->assertUnprocessable();
        $this->patchJson("/designer/designs/$id", ['name' => str_repeat('x', 121)])->assertUnprocessable();

        $this->actingAs(User::factory()->create());
        $this->patchJson("/designer/designs/$id", ['name' => 'Hijacked'])->assertNotFound();
        $this->assertSame('Mine', Design::findOrFail($id)->name);
    }

    public function test_per_brick_measurements_are_saved_and_validated(): void
    {
        $this->actingAs(User::factory()->create());

        $ok = $this->payload();
        $ok['data']['blocks'][0]['measurements'] = ['pinHoleDiameter' => 5.2, 'counterboreDepth' => 0.5];
        $id = $this->postJson('/designer/designs', $ok)->assertCreated()->json('id');
        $this->getJson("/designer/designs/$id")
            ->assertJsonPath('data.blocks.0.measurements.pinHoleDiameter', 5.2)
            ->assertJsonMissingPath('data.blocks.1.measurements');

        $unknown = $this->payload();
        $unknown['data']['blocks'][0]['measurements'] = ['rm -rf' => 1];
        $this->postJson('/designer/designs', $unknown)->assertUnprocessable();

        $range = $this->payload();
        $range['data']['blocks'][0]['measurements'] = ['pinHoleDiameter' => 5000];
        $this->postJson('/designer/designs', $range)->assertUnprocessable();

        $text = $this->payload();
        $text['data']['blocks'][0]['measurements'] = ['pinHoleDiameter' => 'wide'];
        $this->postJson('/designer/designs', $text)->assertUnprocessable();
    }

    public function test_older_global_measurements_still_accepted_but_only_known_names(): void
    {
        $this->actingAs(User::factory()->create());

        $this->postJson('/designer/designs', $this->payload())->assertCreated(); // payload carries pinHoleDiameter globally

        $bad = $this->payload();
        $bad['data']['measurements'] = ['nonsense' => 1];
        $this->postJson('/designer/designs', $bad)->assertUnprocessable();
    }

    public function test_share_and_unshare(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $id = $this->postJson('/designer/designs', $this->payload())->json('id');

        $token = $this->postJson("/designer/designs/$id/share")->assertOk()->json('share_token');
        $this->assertMatchesRegularExpression('/^[a-z0-9]{16}$/', $token);

        // Anonymous visitors are sent to sign in; any signed-in user can open the shared copy.
        auth()->logout();
        $this->get("/p/$token")->assertRedirect('/');
        $this->actingAs(User::factory()->create())->get("/p/$token")->assertOk()->assertSee('Frame 5x7', false);

        $this->actingAs($user)->deleteJson("/designer/designs/$id/share")->assertOk();
        $this->actingAs(User::factory()->create())->get("/p/$token")->assertNotFound();
    }

    public function test_disabled_user_is_blocked(): void
    {
        $this->actingAs(User::factory()->create(['status' => 'disabled']))
            ->getJson('/designer/designs')->assertForbidden();
    }
}
