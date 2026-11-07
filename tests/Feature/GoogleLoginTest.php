<?php

namespace Tests\Feature;

use App\Models\User;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Laravel\Socialite\Two\InvalidStateException;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GoogleLoginTest extends TestCase
{
    use RefreshDatabase;

    private function fakeGoogle(array $attrs = [], array $raw = ['email_verified' => true]): void
    {
        $gu = (new SocialiteUser)->setRaw($raw)->map($attrs + [
            'id' => 'g-123',
            'name' => 'Ada Lovelace',
            'email' => 'Ada@Example.com',
            'avatar' => 'https://example.com/a.png',
        ]);
        $gu->user = $raw;

        $provider = Mockery::mock(GoogleProvider::class);
        $provider->shouldReceive('user')->andReturn($gu);
        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);
    }

    public function test_login_page_renders_google_button(): void
    {
        $this->get('/')->assertOk()->assertSee('Continue with Google');
    }

    public function test_home_page_is_the_login_page_and_login_path_is_gone(): void
    {
        $this->get('/')->assertOk()->assertSee('Log In')->assertSee('name="password"', false)->assertSee('Continue with Google')
            ->assertSee('/auth/google', false)->assertDontSee('Design without an account')
            ->assertDontSee(strrev('cinhceT'))->assertDontSee(strrev('OGEL')); // no third-party brand names on the page
        $this->get('/login')->assertNotFound();
    }

    public function test_signed_in_users_skip_the_login_page(): void
    {
        $this->actingAs(User::factory()->create())->get('/')->assertRedirect('/designer');
    }

    public function test_guests_hitting_a_protected_page_land_on_home(): void
    {
        $this->get('/admin')->assertRedirect('/');
    }

    public function test_redirect_goes_to_google(): void
    {
        config(['services.google.client_id' => 'x', 'services.google.client_secret' => 'y',
            'services.google.redirect' => 'http://localhost/auth/google/callback']);

        $this->get('/auth/google')->assertRedirectContains('accounts.google.com');
    }

    public function test_new_user_is_created_and_logged_in(): void
    {
        $this->fakeGoogle();

        $this->get('/auth/google/callback')->assertRedirect('/designer');

        $user = User::where('email', 'ada@example.com')->firstOrFail();
        $this->assertSame('g-123', $user->google_id);
        $this->assertSame('user', $user->role);
        $this->assertAuthenticatedAs($user);
    }

    public function test_existing_email_is_linked_not_duplicated(): void
    {
        $existing = User::factory()->create(['email' => 'ada@example.com', 'google_id' => null]);
        $this->fakeGoogle();

        $this->get('/auth/google/callback')->assertRedirect('/designer');

        $this->assertSame(1, User::count());
        $this->assertSame('g-123', $existing->fresh()->google_id);
    }

    public function test_unverified_google_email_is_rejected(): void
    {
        $this->fakeGoogle(raw: ['email_verified' => false]);

        $this->get('/auth/google/callback')->assertRedirect('/');
        $this->assertGuest();
        $this->assertSame(0, User::count());
    }

    public function test_disabled_user_cannot_log_in(): void
    {
        User::factory()->create(['email' => 'ada@example.com', 'status' => 'disabled']);
        $this->fakeGoogle();

        $this->get('/auth/google/callback')->assertRedirect('/');
        $this->assertGuest();
    }

    public function test_domain_allow_list(): void
    {
        config(['bitbrick.allowed_domains' => ['school.edu']]);
        $this->fakeGoogle();

        $this->get('/auth/google/callback')->assertRedirect('/');
        $this->assertGuest();
    }

    public function test_invalid_state_shows_friendly_error(): void
    {
        $provider = Mockery::mock(GoogleProvider::class);
        $provider->shouldReceive('user')->andThrow(new InvalidStateException);
        Socialite::shouldReceive('driver')->with('google')->andReturn($provider);

        $this->get('/auth/google/callback')->assertRedirect('/')
            ->assertSessionHasErrors('login');
    }

    public function test_next_parameter_only_accepts_local_paths(): void
    {
        $this->get('/?next=//evil.example/x')->assertOk();
        $this->assertNull(session('url.intended'));

        $this->get('/?next=/designer/library')->assertOk();
        $this->assertStringEndsWith('/designer/library', session('url.intended'));
    }

    public function test_logout(): void
    {
        $this->actingAs(User::factory()->create())->post('/logout')->assertRedirect('/');
        $this->assertGuest();
    }
}
