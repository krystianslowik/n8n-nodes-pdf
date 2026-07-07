# Third-party notices

This package bundles the following third-party components into its published
build output (`dist/`). They are `devDependencies` inlined at build time by
`scripts/esbuild-bundle.mjs`; the published package declares zero runtime
dependencies.

## Fonts — SIL Open Font License 1.1

The full OFL-1.1 license text is available at
<https://openfontlicense.org> (mirrored at <https://scripts.sil.org/OFL>)
and ships alongside each font inside its source npm package (`LICENSE_FONT`
in each `@expo-google-fonts/*` package below).

| Font | Copyright | Source package |
|---|---|---|
| Noto Sans (Regular, Bold, Italic, Bold Italic) | Copyright 2022 The Noto Project Authors (<https://github.com/notofonts/latin-greek-cyrillic>) | `@expo-google-fonts/noto-sans` |
| Noto Sans Mono (Regular) | Copyright 2022 The Noto Project Authors (<https://github.com/notofonts/latin-greek-cyrillic>) | `@expo-google-fonts/noto-sans-mono` |
| Noto Emoji (Regular, monochrome) | Copyright 2013 Google LLC | `@expo-google-fonts/noto-emoji` |

Each font is redistributed unmodified, in its original TTF form, inside the
compiled bundle; subsets of them are embedded into PDFs this node generates
at document-save time. Per the OFL, the fonts may be bundled, embedded,
redistributed, and subset freely (including commercially), may not be sold
by themselves, and are provided "as is" without warranty.

## Libraries — MIT License

| Library | Use |
|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | All PDF parsing/writing |
| [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) | Font parsing/subsetting for embedding the fonts above |

Both libraries' full MIT license texts ship in their respective npm
packages.
