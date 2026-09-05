// Remove the build output. Written as a script rather than `rm -rf dist` so the
// same command works on the Windows matrix cell (D-0007's neighbours: nothing
// cadenza asks a developer to run may assume a POSIX shell).
//
// `build` runs this first, so a file that stops being emitted -- a source
// deleted, a rename -- cannot survive in `dist/` and be packed by `files`.
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
