<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

class AdminTest extends TestCase
{
    use RefreshDatabase;

    private function admin(array $attrs = []): User
    {
        return User::factory()->create(['role' => 'admin'] + $attrs);
    }

    public function test_guests_are_sent_to_login_and_end_users_get_403(): void
    {
        $this->get('/admin')->assertRedirect('/');
        $this->actingAs(User::factory()->create())->get('/admin')->assertForbidden();
        $this->actingAs(User::factory()->create())->post('/admin/users/1/role', ['role' => 'admin'])->assertForbidden();
    }

    public function test_admin_sees_the_user_list_with_design_counts_and_can_search(): void
    {
        $alice = User::factory()->create(['name' => 'Alice Example', 'email' => 'alice@example.com']);
        User::factory()->create(['name' => 'Bob Other', 'email' => 'bob@example.com']);
        $alice->designs()->create(['name' => 'x', 'data' => ['version' => 1, 'blocks' => []]]);

        $this->actingAs($this->admin())->get('/admin')->assertOk()
            ->assertSee('Alice Example')->assertSee('Bob Other');

        $this->get('/admin?q=alice')->assertOk()->assertSee('Alice Example')->assertDontSee('Bob Other');
        $this->get('/admin?q=%25')->assertOk()->assertDontSee('Alice Example'); // % is not a wildcard
    }

    public function test_admin_can_promote_and_demote_another_user(): void
    {
        $user = User::factory()->create();
        $this->actingAs($this->admin());

        $this->post("/admin/users/{$user->id}/role", ['role' => 'admin'])->assertSessionHas('ok');
        $this->assertTrue($user->fresh()->isAdmin());

        $this->post("/admin/users/{$user->id}/role", ['role' => 'user'])->assertSessionHas('ok');
        $this->assertFalse($user->fresh()->isAdmin());
    }

    public function test_admin_cannot_change_own_role_or_status(): void
    {
        $me = $this->admin();
        $this->actingAs($me);

        $this->post("/admin/users/{$me->id}/role", ['role' => 'user'])->assertSessionHas('fail');
        $this->post("/admin/users/{$me->id}/status", ['status' => 'disabled'])->assertSessionHas('fail');
        $this->assertTrue($me->fresh()->isAdmin());
        $this->assertTrue($me->fresh()->isEnabled());
    }

    public function test_configured_admin_cannot_be_demoted(): void
    {
        config(['bitbrick.admin_emails' => ['boss@example.com']]);
        $boss = $this->admin(['email' => 'boss@example.com']);
        $this->actingAs($this->admin());

        $this->post("/admin/users/{$boss->id}/role", ['role' => 'user'])->assertSessionHas('fail');
        $this->assertTrue($boss->fresh()->isAdmin());
    }

    public function test_disabling_a_user_blocks_their_next_request(): void
    {
        $user = User::factory()->create();
        $this->actingAs($this->admin())->post("/admin/users/{$user->id}/status", ['status' => 'disabled'])
            ->assertSessionHas('ok');

        auth()->logout();
        $this->actingAs($user->fresh())->getJson('/designer/designs')->assertForbidden();
    }

    public function test_invalid_role_or_status_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->actingAs($this->admin());

        $this->post("/admin/users/{$user->id}/role", ['role' => 'root'])->assertSessionHasErrors('role');
        $this->post("/admin/users/{$user->id}/status", ['status' => 'banned'])->assertSessionHasErrors('status');
        $this->assertSame('user', $user->fresh()->role);
    }

    public function test_role_cannot_be_set_through_mass_assignment(): void
    {
        $u = new User(['name' => 'x', 'email' => 'x@example.com', 'role' => 'admin']);
        $this->assertNotSame('admin', $u->role);
    }

    public function test_configured_admin_email_is_promoted_on_google_login(): void
    {
        config(['bitbrick.admin_emails' => ['boss@example.com']]);
        $raw = ['email_verified' => true];
        $gu = (new SocialiteUser)->setRaw($raw)->map(['id' => 'g-9', 'name' => 'Boss', 'email' => 'Boss@Example.com', 'avatar' => null]);
        $gu->user = $raw;
        $provider = Mockery::mock(GoogleProvider::class);
        $provider->shouldReceive('user')->andReturn($gu);
        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

        $this->get('/auth/google/callback')->assertRedirect('/designer');

        $this->assertTrue(User::where('email', 'boss@example.com')->firstOrFail()->isAdmin());
    }

    public function test_ordinary_google_login_is_an_end_user(): void
    {
        $raw = ['email_verified' => true];
        $gu = (new SocialiteUser)->setRaw($raw)->map(['id' => 'g-8', 'name' => 'Eve', 'email' => 'eve@example.com', 'avatar' => null]);
        $gu->user = $raw;
        $provider = Mockery::mock(GoogleProvider::class);
        $provider->shouldReceive('user')->andReturn($gu);
        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

        $this->get('/auth/google/callback');

        $this->assertSame('user', User::where('email', 'eve@example.com')->firstOrFail()->role);
    }

    public function test_make_admin_command_creates_promotes_and_revokes(): void
    {
        $this->artisan('bitbrick:make-admin', ['email' => 'New@Example.com'])->assertSuccessful();
        $this->assertTrue(User::where('email', 'new@example.com')->firstOrFail()->isAdmin());

        $existing = User::factory()->create();
        $this->artisan('bitbrick:make-admin', ['email' => $existing->email])->assertSuccessful();
        $this->assertTrue($existing->fresh()->isAdmin());

        $this->artisan('bitbrick:make-admin', ['email' => $existing->email, '--revoke' => true])->assertSuccessful();
        $this->assertFalse($existing->fresh()->isAdmin());

        $this->artisan('bitbrick:make-admin', ['email' => 'nobody@example.com', '--revoke' => true])->assertFailed();
        $this->artisan('bitbrick:make-admin', ['email' => 'not-an-email'])->assertFailed();
    }

    public function test_seeder_creates_admins_and_is_idempotent(): void
    {
        config(['bitbrick.admin_emails' => ['boss@example.com']]);
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(2, User::count());
        $this->assertTrue(User::where('email', 'peter@quantr.hk')->firstOrFail()->isAdmin());
        $this->assertTrue(User::where('email', 'boss@example.com')->firstOrFail()->isAdmin());
    }

    public function test_designer_boot_exposes_admin_link_only_to_admins(): void
    {
        $this->actingAs(User::factory()->create())->get('/designer')->assertDontSee('\/admin', false);
        $this->actingAs($this->admin())->get('/designer')->assertSee('\/admin', false);
    }
}
