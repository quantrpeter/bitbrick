# BitBrick

Web portal for designing pin-and-axle building parts in the browser and exporting them as STL for 3D printing.

- Backend: Laravel 13 (PHP 8.4+), Google login via Socialite
- Designer: React 19 + Three.js in `designer/`, geometry by `manifold-3d` (WASM, in a Web Worker)
- Production: Docker (`Dockerfile`, `docker-compose-prod.yml`)
- Plan and roadmap: [skill/1. plan.md](skill/1.%20plan.md)

## Develop

```sh
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate   # local dev uses SQLite
cd designer && npm install                       # node 22+
```

Side-loaded development (same idea as `n/network`):

```sh
php artisan serve                  # http://localhost:8000/designer
cd designer && npm start           # webpack dev server on :8095
```

The page `/designer` is served by Laravel. In the `local` environment it first tries
`http://localhost:8095/bundle.js` (a red "Dev server" badge shows when that works) and otherwise falls back to
the built bundle in `public/designer-production`. Outside `local` the dev server is never probed.

Build the bundle without Docker: `cd designer && npm run build`.

### Signing in

BitBrick cannot be used anonymously: every page except the login page (`/`) needs a signed-in, enabled user.
Sign in with **e-mail address or username + password**, or with **Google**. A link opened while signed out
(including `/designer#part=...` share links) goes through the login page and then opens as intended.

There is no self-registration or password e-mail. Password accounts are created and reset by an administrator:

```sh
# in /admin: "Add user with password" and "Set password" on each row, or on the command line:
php artisan bitbrick:set-password you@example.com           # prompts for the password
php artisan bitbrick:make-admin you@example.com             # create or promote an admin first, if needed
```

`php artisan db:seed` creates `peter@quantr.hk` (username `admin`) as an administrator and, when
`BITBRICK_ADMIN_PASSWORD` is set in `.env` / `.env.prod`, sets that password. The password is never stored in source code.
Failed logins are limited to 5 per minute per account and address.

Google: create an OAuth client for BitBrick in Google Cloud Console, add `http://localhost:8000/auth/google/callback`
(and the production URL) as authorized redirect URIs, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
The login page background is `public/images/login-bg.webp`.

### Users: admin and end user

| | End user | Admin |
|---|---|---|
| Design, export STL, save and open projects, share links | yes, after signing in | yes, after signing in |
| `/admin`: list and search users, make admin or end user, enable or disable | no (403) | yes |

Everyone who signs in with Google starts as an end user (so Google sign-in is open to any Google account unless you set `BITBRICK_ALLOWED_DOMAINS`). Create admins by any of these:

```sh
BITBRICK_ADMIN_EMAILS=you@gmail.com,other@gmail.com   # in .env: promoted when they sign in
php artisan db:seed                                   # creates the admins in that list (and peter@quantr.hk)
php artisan bitbrick:make-admin you@gmail.com         # one-off; add --revoke to undo
```

Rules in `/admin`: you cannot change your own role or disable yourself, and addresses in `BITBRICK_ADMIN_EMAILS`
cannot be demoted there (remove them from the list). A disabled user is signed out on their next request.

### Projects

The top bar has **New**, **Open**, **Save** and **Save as**; the project name is at the top right (click it to rename).
- **New** asks for a name (and warns when unsaved work would be discarded). **Save** writes the project; a project that was never
  saved or named asks for a name first. **Save as** stores a copy under a new name. Ctrl/Cmd+S also saves.
- **Open** lists every saved project. There you can open, rename, turn a share link on or off, or delete one. Share links open
  as an unsaved copy for any signed-in user.
- Renaming a saved project from the top right changes only its name on the server; edits that are not saved yet stay unsaved.

### Measurements (per brick)

Measurements belong to individual bricks: select a brick (click it or move the cursor onto it) and the Measurements section
shows the values for that brick's type (pin hole diameter and counterbore, axle hole size, pin and axle size, ball joint size,
edge margin, corner radius). *Apply* changes that brick only; *Apply to all N bricks* copies the values to every brick of the
same type. The grid unit and the smoothness of round shapes are fixed (they cannot differ per brick). Designs saved earlier with
whole-part values keep working: those values act as the defaults for bricks that have none of their own.

### Placing catalog parts

Each catalog card shows a real 3D picture of the part (rendered in the browser from the same geometry as the view, once per
session). Clicking a card does not add anything at once: a transparent preview follows the mouse, `w` / `s` move it up and down,
the arrow keys nudge it, a left click or Enter places it, and Esc (or clicking the card again) cancels. Undo removes a placed part.

While the preview follows the mouse, `x` / `y` / `z` point the part along that axis (the direction of its holes, pins, axles or
ball joints) and pressing the same key again reverses it: `x`, `x` places it towards -X. The banner shows the current direction.

### Gears and round parts

The **Gear** brick (key `7`) is a spur gear centred on its cell. Set its **Teeth** (8 to 64) in the Measurements panel; the tooth
size is fixed, so a gear with N teeth is N mm across the pitch circle and two gears mesh when their centres are (N1 + N2) / 2 mm
apart. With 8 mm cells, gears of 8, 24, 40 teeth mesh with each other at whole-cell spacing, and so do 16, 32, 48 teeth. Its axle
hole stays open unless an axle brick continues through it from the next cell, which then fills the hole. A cylinder is an
ordinary brick with the corner radius set to 4 mm (half a cell); the *Round parts* presets use that. The tooth profile is
straight sided (not an exact involute), which is fine for printed gears.

### Ball joints

A ball joint finds the end it is connected to: the neck sits on the end that touches a neighbouring brick (along the joint's own
axis) and the ball on the free end, so it always points away from what holds it. With a neighbour on neither end, or on both, the
neck stays on the low end of the axis.

### Axes and keys

X and Y are the flat directions and **Z is up** (right handed: X right, Y away from you). An axis gizmo in the bottom right corner
of the 3D view always shows how the camera is oriented. Keys: arrow left/right move the cursor along X, arrow up/down along Y,
`w` / `s` up and down (Z); `x` `y` `z` set the hole direction. The STL is exported Z-up, resting on Z = 0, which is what slicers
expect. Internally the app stores Y-up coordinates (Three.js), so saved designs and share links are unaffected; the mapping lives
in one file, `designer/src/model/axes.js`.

### Display styles and colour

Part panel (or the toolbar's style button): Contour, Solid, Wireframe, X-ray and **Realistic (ray traced)**. A colour row
applies to every style. The choice (style, colour, ray tracing quality) is remembered in the browser and never changes the STL.

Realistic uses GPU path tracing ([three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer), WebGL2): it shows a
fast preview, then refines a physically based image (soft shadows, reflections on glossy plastic) up to 64 / 256 / 1024 samples
(Quality: Draft / Good / Best). Moving the camera or changing the part restarts it. The library (about 220 KB) is only downloaded
the first time Realistic is chosen. Browsers or GPUs without WebGL2 float rendering fall back to the fast preview with a notice.
The package's WebGL tracer is marked deprecated by its author (its successor needs WebGPU), so the version is pinned in
`designer/package-lock.json`; revisit when WebGPU is widely available.

### Tests

```sh
php artisan test           # login, design API, authorization, SPA host page
cd designer && npm test    # share-link codec, measurements, geometry (manifold meshes), STL
```

## Deploy

```sh
./release.sh 1.0                                           # build + push the multi-arch image
cp .env.prod.example .env.prod                             # fill in; never commit
docker compose --env-file .env.prod -f docker-compose-prod.yml up -d
```

The image builds the designer bundle in its own stage (and runs the designer tests there), so nothing needs to be
uploaded by hand. `docker-compose-prod.yml` contains no secrets. MySQL and Redis have no host ports.
Run a reverse proxy or CDN in front for TLS and point it at port 8003.
