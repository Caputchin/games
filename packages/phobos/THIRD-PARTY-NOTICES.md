# Third-party notices

Phobos bundles a real DOOM engine and a free game-data set. This file records
their licenses and attribution. The Phobos package as a whole is distributed
under **GPL-2.0-only** (see `package.json` / `caputchin.json`), because it links
the GPL DOOM engine.

## DOOM engine (doomgeneric / Chocolate Doom lineage), GPL-2.0

The headless replay engine and the live game engine are compiled from a vendored,
patched copy of [doomgeneric](https://github.com/ozkl/doomgeneric), which is
derived from [Chocolate Doom](https://www.chocolate-doom.org/) and the original
**DOOM source code** released by id Software.

- Copyright (C) 1993-1996 id Software, Inc.
- Copyright (C) 2005-2014 Simon Howard and the Chocolate Doom contributors.
- Copyright (C) doomgeneric contributors.

The DOOM source code is licensed under the **GNU General Public License, version
2** (id Software relicensed it under the GPL on 1999-10-03). The complete
corresponding source for the engine as shipped (including the Phobos patches:
seeded spawn, deterministic input capture/replay, headless platform, minimal-WAD
robustness fixes) lives in this package's `engine/` directory and is offered
under the same GPL-2.0 terms.

A copy of the GNU General Public License version 2 is available at
<https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt>.

## Game data (Freedoom), BSD-3-Clause

The bundled `phobos.wad` is assembled from assets of the
[Freedoom](https://freedoom.github.io/) project (a free, libre replacement for
the DOOM game data). No id Software game data (no shareware or retail WAD) is
used or distributed. The Freedoom assets are redistributed under the following
license:

> Copyright (C) 2001-2024 Contributors to the Freedoom project. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
>   * Redistributions of source code must retain the above copyright notice,
>     this list of conditions and the following disclaimer.
>   * Redistributions in binary form must reproduce the above copyright notice,
>     this list of conditions and the following disclaimer in the documentation
>     and/or other materials provided with the distribution.
>   * Neither the name of the Freedoom project nor the names of its contributors
>     may be used to endorse or promote products derived from this software
>     without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
> ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
> (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
> LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
> ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
> (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
> SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

See also `TRADEMARK.md` for the DOOM trademark notice.
