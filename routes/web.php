<?php

use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\GoogleLoginController;
use App\Http\Controllers\DesignController;
use App\Http\Controllers\DesignerController;
use App\Http\Controllers\SharedDesignController;
use Illuminate\Support\Facades\Route;

// The home page is the login page (username/e-mail + password, or Google). Signed-in users are sent on to the designer.
Route::get('/', [AuthController::class, 'show'])->name('login');
Route::post('/', [AuthController::class, 'login'])->middleware('throttle:30,1');
Route::get('/auth/google', [GoogleLoginController::class, 'redirect'])
    ->middleware('throttle:20,1')->name('auth.google');
Route::get('/auth/google/callback', [GoogleLoginController::class, 'callback'])
    ->middleware('throttle:20,1')->name('auth.google.callback');
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

// Everything below needs a signed-in, enabled user: nobody can use BitBrick anonymously.
Route::middleware(['auth', 'enabled'])->group(function () {
    // Shared designs open as an unsaved copy for any signed-in user who has the link.
    Route::get('/p/{token}', [SharedDesignController::class, 'show'])->where('token', '[a-z0-9]{16}');

    // Saved-design API. Must be declared BEFORE the /designer/{any} SPA catch-all.
    Route::prefix('designer/designs')->group(function () {
        Route::get('/', [DesignController::class, 'index']);
        Route::post('/', [DesignController::class, 'store']);
        Route::get('/{id}', [DesignController::class, 'show'])->whereNumber('id');
        Route::put('/{id}', [DesignController::class, 'update'])->whereNumber('id');
        Route::patch('/{id}', [DesignController::class, 'rename'])->whereNumber('id');
        Route::delete('/{id}', [DesignController::class, 'destroy'])->whereNumber('id');
        Route::post('/{id}/share', [DesignController::class, 'share'])->whereNumber('id');
        Route::delete('/{id}/share', [DesignController::class, 'unshare'])->whereNumber('id');
    });

    // SPA host
    Route::get('/designer', [DesignerController::class, 'index']);
    Route::get('/designer/{any}', [DesignerController::class, 'index'])->where('any', '.*');  // LAST
});

// Administration (admin role only)
Route::middleware(['auth', 'enabled', 'admin'])->prefix('admin')->group(function () {
    Route::get('/', [AdminUserController::class, 'index'])->name('admin.users');
    Route::post('/users/{user}/role', [AdminUserController::class, 'updateRole'])->whereNumber('user');
    Route::post('/users/{user}/status', [AdminUserController::class, 'updateStatus'])->whereNumber('user');
    Route::post('/users/{user}/password', [AdminUserController::class, 'updatePassword'])->whereNumber('user');
    Route::post('/users', [AdminUserController::class, 'store']);
});
