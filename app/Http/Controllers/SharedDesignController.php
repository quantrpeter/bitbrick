<?php

namespace App\Http\Controllers;

use App\Models\Design;
use Illuminate\Http\Request;

class SharedDesignController extends Controller
{
    /** Public, read-only entry point: the SPA opens the part as an unsaved copy. */
    public function show(Request $request, string $token)
    {
        $design = Design::where('share_token', $token)->where('is_public', true)->firstOrFail();

        return view('designer', ['boot' => DesignerController::boot($request, [
            'name' => $design->name,
            'data' => $design->data,
        ])]);
    }
}
