<?php
// Creates (or removes) the throwaway account the tutorial videos sign in with.
//   VIDEO_DEMO_PASSWORD=... php video/lib/demo-user.php create
//   php video/lib/demo-user.php delete          (also deletes the projects saved while recording)
// The password is passed in the environment by the recorder and is never written to a file.
chdir(__DIR__.'/../..');
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

const EMAIL = 'video-demo@example.com';
$action = $argv[1] ?? '';

if ($action === 'create') {
    $password = getenv('VIDEO_DEMO_PASSWORD');
    if (! $password) { fwrite(STDERR, "VIDEO_DEMO_PASSWORD is not set\n"); exit(1); }
    $user = App\Models\User::firstOrNew(['email' => EMAIL]);
    $user->name = 'Demo';
    $user->forceFill(['username' => 'demo', 'password' => $password, 'status' => 'enabled', 'role' => 'user'])->save();
    $user->designs()->delete();
    echo "created\n";
} elseif ($action === 'delete') {
    App\Models\User::where('email', EMAIL)->delete(); // designs go with it (cascade)
    echo "deleted\n";
} else {
    fwrite(STDERR, "usage: demo-user.php create|delete\n"); exit(1);
}
