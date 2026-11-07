<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('google_id')->nullable()->unique()->after('email');
            $table->string('avatar', 2048)->nullable()->after('google_id');
            $table->string('role', 16)->default('user')->after('avatar');
            $table->string('status', 16)->default('enabled')->after('role');
            // Accounts are Google-only, so there is no password.
            $table->string('password')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['google_id']);
            $table->dropColumn(['google_id', 'avatar', 'role', 'status']);
        });
    }
};
