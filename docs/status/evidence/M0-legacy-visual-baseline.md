# M0 legacy visual baseline

Date recovered: 2026-09-06  
Historical revision: `ca198d6c268a26765ee60fb40af96568a00c1223`  
Viewport: 1440 × 900, Chromium

## Result

The two public routes recorded in the frozen M0 manifest were rendered from the
historical `apps/web` tree and captured successfully:

- [`M0-legacy-home.png`](M0-legacy-home.png) — `/`, SHA-256
  `d26fd4c97d96a790b0b89252091c1e9a5cbd771b2a606c20f5df1f06f1fe23c6`
- [`M0-legacy-projects.png`](M0-legacy-projects.png) — `/projects`, SHA-256
  `e509228ec8b7cf8c0254d573538d5f70cd4e48d4e87dd609df2ddc95a036d984`

Both routes returned HTTP `200`. The captures show the original dark visual
identity, floating navigation, animated code background, cube hero, and legacy
project catalog before the localized database-backed cutover.

## Recovery method and boundary

The historical web tree was checked out into an isolated detached worktree and
served on `localhost:3010`. Its package manifest pins the same Next.js 16.3.0 and
React 19.2.4 versions available in the verified current workspace, so the
historical source was rendered with that pinned framework version.

The removed `@emailjs/browser` dependency was replaced only inside the temporary
evidence environment by a non-sending stub. This was necessary to compile the
historical contact component without restoring or using the published provider
credentials. No form was submitted, and the stub cannot send mail. It does not
affect either captured route's initial visual output.

The temporary server, dependency stub, and detached worktree were removed after
the PNG files were inspected. The frozen [`BASELINE_M0.md`](../../BASELINE_M0.md)
manifest was not regenerated or modified.
