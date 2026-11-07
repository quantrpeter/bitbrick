<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('designs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->json('data');
            $table->unsignedSmallInteger('schema_version')->default(1);
            $table->mediumText('thumbnail')->nullable();
            $table->boolean('is_public')->default(false);
            $table->string('share_token', 32)->nullable()->unique();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('designs');
    }
};
