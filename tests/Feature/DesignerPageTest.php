<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DesignerPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_landing_and_health(): void
    {
        $this->get('/')->assertOk()->assertSee('BitBrick');
        $this->assertFileExists(public_path('images/login-bg.webp')); // served by the web server, not Laravel
        $this->get('/up')->assertOk();
    }

    public function test_nothing_is_usable_without_signing_in(): void
    {
        foreach (['/designer', '/designer/library/12', '/designer/d/3', '/p/abcdefghij123456'] as $path) {
            $this->get($path)->assertRedirect('/');
        }
        $this->getJson('/designer/designs')->assertUnauthorized();
    }

    public function test_guest_redirect_remembers_where_they_were_going(): void
    {
        $user = User::factory()->create(['username' => 'ada']);
        $user->forceFill(['password' => 'correct-horse-1'])->save();

        $this->get('/designer/d/3')->assertRedirect('/');
        $this->post('/', ['login' => 'ada', 'password' => 'correct-horse-1'])->assertRedirect(url('/designer/d/3'));
    }

    public function test_designer_has_spa_catch_all_for_signed_in_users(): void
    {
        $this->actingAs(User::factory()->create());
        $this->get('/designer')->assertOk()->assertSee('id="main"', false)->assertSee('window.__BITBRICK__', false);
        $this->get('/designer/library/12')->assertOk()->assertSee('id="main"', false);
    }

    public function test_bootstrap_contains_user_when_logged_in(): void
    {
        $user = User::factory()->create(['name' => 'Grace']);

        $this->actingAs($user)->get('/designer')->assertOk()->assertSee('Grace');
    }

    public function test_dev_server_probe_only_in_local_environment(): void
    {
        $this->actingAs(User::factory()->create());
        $this->app['env'] = 'local';
        $this->get('/designer')->assertSee('localhost:8095', false);

        $this->app['env'] = 'production';
        $this->get('/designer')->assertDontSee('localhost:8095', false);
    }

    public function test_bootstrap_json_is_escaped(): void
    {
        $user = User::factory()->create(['name' => '</script><script>alert(1)</script>']);

        $this->actingAs($user)->get('/designer')
            ->assertDontSee('</script><script>alert(1)', false);
    }
}
