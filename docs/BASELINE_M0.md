# M0 legacy baseline

Generated once by `node scripts/capture-baseline.mjs`, before Phase 0 stabilization. **Frozen: do not edit and do not regenerate.** Refreshing this file to match the current checkout would erase the only record it exists to keep.

This is the pre-stabilization record of the legacy portfolio required by [ROADMAP.md](ROADMAP.md) §6 (M0) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 0. It is captured *before* the certificate path casing is corrected and *before* redundant font formats are deleted, so that every later change can be proved intentional rather than accidental.

It is also the input to the M2 reconciliation in [CONTENT_INVENTORY.md](CONTENT_INVENTORY.md) §15: migrated output is compared against these counts and hashes, not against a re-read of a source that may have drifted.

## 1. Capture identity

| Field | Value |
| --- | --- |
| Files hashed | 137 |
| Total bytes | 9,311,758 |
| Manifest digest (SHA-256 of §4) | `f05b3e997bac948c9376f8705c02435f7f5c4143195dc428a248b5705d407fcb` |
| Hashed trees | apps/web/src, apps/web/public |

The manifest digest is the single value to compare when asking "has the legacy source changed?". It covers §4 in full.

## 2. Legacy routes

Route groups in parentheses do not appear in the URL. Every URL below must still resolve after the M4 cutover through exactly one `308` redirect to its locale-prefixed equivalent.

| URL | Source | Rendering |
| --- | --- | --- |
| `/` | `apps/web/src/app/(Home Page)/page.tsx` | static |
| `/projects` | `apps/web/src/app/(Other Pages)/projects/page.tsx` | static |
| `*` | `apps/web/src/app/not-found.tsx` | 404 handler |

## 3. Legacy content counts

These are the authoritative pre-migration counts. M2 must reconcile against them exactly; a mismatch is a migration defect, not a rounding difference.

| Source | Records |
| --- | --- |
| `src/DataBase/Projects.json` | 14 projects |
| `src/DataBase/Skills.json` | 6 categories, 26 skills |
| `src/DataBase/Certificate.json` | 5 certificates |
| `src/DataBase/DailyQuote.json` | 35 quotes |

### Font files at capture time

| Format | Files |
| --- | --- |
| `.eot` | 17 |
| `.ttf` | 17 |
| `.woff` | 17 |
| `.woff2` | 17 |

Phase 0 stabilization keeps the `woff2` set and deletes the rest. The hashes in §4 are the record of what was removed.

## 4. File manifest

| Path (relative to `apps/web/`) | Bytes | SHA-256 |
| --- | --- | --- |
| `public/Certificates/Next.pdf` | 515726 | `163e65fefe48925dac0aeb2bb6537ee31a013a555568a8a70f4e6a3b55573e14` |
| `public/Certificates/React.pdf` | 502807 | `0f7d607ff0cb5d0e4c4a94fea61652e01a5f766436af580764b5d34a08b28f24` |
| `public/Certificates/Web-1.pdf` | 514902 | `41c6547e3de6e3d4e93d08dbd2aa59b1b33c4eb5361ae9dfa3713708be71625b` |
| `public/Certificates/Web-2.pdf` | 519381 | `6e7c9235ff6b8d82cb4d2e4a5f4c54beeb5fbc01138382f19da50f3f65e51123` |
| `public/Certificates/Web-3.pdf` | 512759 | `ec4d3b375c1322c6061c19e12c9d9cb92e250fc4fbe9bb3fab15c7a7462d3577` |
| `public/Fonts/JetBrainsMono-Bold.eot` | 135916 | `1b5a34d4fa2137f927e4b30c791813b118d47dee651067964739e8229c4729aa` |
| `public/Fonts/JetBrainsMono-Bold.ttf` | 135716 | `41420ac652aba9befcd9aa0a856417220e74dabb56c7fdca4dce5b6c38ce4933` |
| `public/Fonts/JetBrainsMono-Bold.woff` | 56864 | `010c0bcd9f8a6fde64f2e96189e4195c9056217e0f07892974e7dc67a13fd067` |
| `public/Fonts/JetBrainsMono-Bold.woff2` | 39728 | `0ec74ab198048786dc8da151f0c015b418cbe0a0c01654663c11d001aa9c13e2` |
| `public/Fonts/JetBrainsMono-BoldItalic.eot` | 138712 | `63509e94b452c0c2b94c2b316a127000ea435f95991a5fbbd0a02c563e0ad569` |
| `public/Fonts/JetBrainsMono-BoldItalic.ttf` | 138484 | `83d84715fc69703504bd2f05b6d1a6eafdfc325578e08e04a1df1d484c6bc021` |
| `public/Fonts/JetBrainsMono-BoldItalic.woff` | 60272 | `c1af949e7109f8ade6a40d0d2bfc9b21c663c74034ce1592df537b5a4ff02269` |
| `public/Fonts/JetBrainsMono-BoldItalic.woff2` | 42072 | `7c8915885845712c8cd4b61a2c1794a44494d61ad58f1051645f23b54340ddac` |
| `public/Fonts/JetBrainsMono-ExtraBold.eot` | 136124 | `1c48c457462e3382fb08a91a0c364294707df25d589d4842ce73a8429d2ffb94` |
| `public/Fonts/JetBrainsMono-ExtraBold.ttf` | 135888 | `d8d84c5b9f7166e7203977063c663da2380485cb72ba2b1a781b3df82c32f416` |
| `public/Fonts/JetBrainsMono-ExtraBold.woff` | 55452 | `0ea7e49f40c04b3adc84cd66e75834a186d1eabb25eb965f5bb6b48549a53203` |
| `public/Fonts/JetBrainsMono-ExtraBold.woff2` | 38508 | `cf372d6ccf79b417f58f3ce2e34c68f937c9b6bd76b1a315797a1efb508b653a` |
| `public/Fonts/JetBrainsMono-ExtraBoldItalic.eot` | 138896 | `d2d8cd83ab6ac244e7028d06e4a12bb71fa94c16e7c5f1138b46961896b3ae78` |
| `public/Fonts/JetBrainsMono-ExtraBoldItalic.ttf` | 138648 | `a482a8f84fbbf75008e4b2474a14a464825c50028e811f6bed73ff308e46e960` |
| `public/Fonts/JetBrainsMono-ExtraBoldItalic.woff` | 58996 | `905d186673663717b9971a4a37dfaa53f92df15392fdba60f989a69b92ab9866` |
| `public/Fonts/JetBrainsMono-ExtraBoldItalic.woff2` | 40812 | `10ea76515b21cf1f0e62f3afce784cd30d9c0134301ce1cdc8d4f988aa0b9546` |
| `public/Fonts/JetBrainsMono-ExtraLight.eot` | 136364 | `d1276b17756c64477c6f4b8902670cc40a6103f39cf37045c1b66be813ecce40` |
| `public/Fonts/JetBrainsMono-ExtraLight.ttf` | 136124 | `253c57b85404381f78887446bd27fa4d8b8f8d4633e56c1a25f7498be8c3091c` |
| `public/Fonts/JetBrainsMono-ExtraLight.woff` | 56624 | `4db2e03d55042e44a4c44c77738b417da432e71493007adc765c79802d385f78` |
| `public/Fonts/JetBrainsMono-ExtraLight.woff2` | 39512 | `55b7333d538f0e1cc927b78cea20c99b31480984f36f87045728f6247a627abe` |
| `public/Fonts/JetBrainsMono-ExtraLightItalic.eot` | 139128 | `30e1014af5d8a87534a03c4b417f5e32be10ec1616276a68d56158c1d0e346f6` |
| `public/Fonts/JetBrainsMono-ExtraLightItalic.ttf` | 138876 | `539d15d19972bc6998f2098bae04c77a0a4b57508dc2408f0aa4306538c73bcf` |
| `public/Fonts/JetBrainsMono-ExtraLightItalic.woff` | 60016 | `04cf5db149f4714956ba1ef059d2aba3cc641a30723c51cc77b664b6cc983310` |
| `public/Fonts/JetBrainsMono-ExtraLightItalic.woff2` | 41860 | `cdaeed67040d3fae2543870cb55fc8326114d5bb791538863609b7c39de3efba` |
| `public/Fonts/JetBrainsMono-Italic.eot` | 138688 | `0b4714892e93885da9e94eac4d2f1d568ebca2de35ce9220246635ade635489a` |
| `public/Fonts/JetBrainsMono-Italic.ttf` | 138480 | `3066a474a4115ff1a99263e4fa8b5e66ceb14de5b45a48f2b4fc00d5ac524cb4` |
| `public/Fonts/JetBrainsMono-Italic.woff` | 59092 | `823644701002c36f118a1e4ba62e7593fca5da6181bfe019a866138758b19da7` |
| `public/Fonts/JetBrainsMono-Italic.woff2` | 40776 | `37d15cce77adfb61721350fdb5852649100f2c74f8e4be1c10af18df978af82a` |
| `public/Fonts/JetBrainsMono-Light.eot` | 136236 | `11964b4604315f6683b76a5c2212707575114fe6fc9a03303e52ac69e9950bd9` |
| `public/Fonts/JetBrainsMono-Light.ttf` | 136016 | `d51b1f3e4ddae9e75663739f9bf3c6c7b23784d6acf68737540e422c7142bcfd` |
| `public/Fonts/JetBrainsMono-Light.woff` | 56856 | `3b958b9b7b187e4fb1d2cab9df62925ba8f09c2c55224f6a2edb5414b752d16c` |
| `public/Fonts/JetBrainsMono-Light.woff2` | 39700 | `09e99b20837d254069baad02e49e8daf21538b4dd91f10c183366232f58c7f50` |
| `public/Fonts/JetBrainsMono-LightItalic.eot` | 138968 | `498631b572874b3ceb6fef4f91c5354cd9d2c06d90fb903d3f6f9b6358de00ac` |
| `public/Fonts/JetBrainsMono-LightItalic.ttf` | 138736 | `968f49e637ca8c4db4c5109651ad1ffe737316a7c07cab28f5ec22017988f6e4` |
| `public/Fonts/JetBrainsMono-LightItalic.woff` | 60312 | `1f5130785ac77b4352ba6c4c09a7717ae9c5aab8e3f912388b0aee2d17f00f96` |
| `public/Fonts/JetBrainsMono-LightItalic.woff2` | 42256 | `80b0b002232734c0a2bc432cc881bf0694d4ba792b2f79052ea341be6bb3c4e8` |
| `public/Fonts/JetBrainsMono-Medium.eot` | 136152 | `cdde9111356bb3e08d64c27d74199579f4eaa67817907a7184c5f4634a8b50fa` |
| `public/Fonts/JetBrainsMono-Medium.ttf` | 135928 | `f668084398e85a6927f4b874b74f22bb48a5250878dad0ba6039168a9dea93f0` |
| `public/Fonts/JetBrainsMono-Medium.woff` | 56800 | `fcb35b3da0e4a29d87bb6e912f6c7c1faf58c5f6a2274eb204cb174c3abbcfc3` |
| `public/Fonts/JetBrainsMono-Medium.woff2` | 39592 | `3903288c22017f5055d872456815b536826c53b4197cc1201be04e9333d0b987` |
| `public/Fonts/JetBrainsMono-MediumItalic.eot` | 138916 | `17c46117f29c2cc971d4d1572246ff7410d2888390c1597f44dc000a21c811d8` |
| `public/Fonts/JetBrainsMono-MediumItalic.ttf` | 138680 | `9ffc3d361ae5676ae0d03e2e68cf3880e45d04564ecaf6c91daa59f90101e546` |
| `public/Fonts/JetBrainsMono-MediumItalic.woff` | 60372 | `225d628220518f66a7f2000208f8c51730f01247d082ca69ef5844d93a8ca40d` |
| `public/Fonts/JetBrainsMono-MediumItalic.woff2` | 42076 | `a7b840d0279051479b458528aa70cb3ad0d3959b4b2bfbec9de50799e8a92565` |
| `public/Fonts/JetBrainsMono-Regular.eot` | 136024 | `05e75c3f29e0b3f06b7ba814af6d0cebab7c8e3fc3c59cccbf6300c1ba04e44c` |
| `public/Fonts/JetBrainsMono-Regular.ttf` | 135812 | `06e81621c058896db6d421cc789990620c40dc07bea5423aa27025f7eb49160f` |
| `public/Fonts/JetBrainsMono-Regular.woff` | 55660 | `a73167dc9c757cb3c0ffa942938c62d971d810177d309b15b536273f4e414b76` |
| `public/Fonts/JetBrainsMono-Regular.woff2` | 38464 | `aa28646bdb6f568a90aae7cdb1cb832231f9277d3a108805d34ef2dca811d36f` |
| `public/Fonts/JetBrainsMono-SemiBold.eot` | 136164 | `522a661a07ebd696bd19d528947883272dfef4bc7df99e912ff91ac50483390a` |
| `public/Fonts/JetBrainsMono-SemiBold.ttf` | 135932 | `2d6f130e2839ded73e0c498427ddfdb6c49a18b8b5ad70fd966776061d663c4e` |
| `public/Fonts/JetBrainsMono-SemiBold.woff` | 56920 | `3d0315d3f4bc9a98e969ff41449d04d83d95d19c3227650c0f858c9d8c042d6c` |
| `public/Fonts/JetBrainsMono-SemiBold.woff2` | 39620 | `f8109f55d460d9f3cf0c866c6e9565130cc507245535bdbe0bbe498b3027d0ef` |
| `public/Fonts/JetBrainsMono-SemiBoldItalic.eot` | 138920 | `49830e912f1a1f6de6275c60ac985fa5d1e5066a970166ac1b63c1b2329e94b8` |
| `public/Fonts/JetBrainsMono-SemiBoldItalic.ttf` | 138676 | `a1baf958829e46412db04abc886813ed4364f414f4a550db9414fb56dc883e5a` |
| `public/Fonts/JetBrainsMono-SemiBoldItalic.woff` | 60372 | `b0f571aab68d43ab3753d9bef966efffbf168140c92dd931d377c5b7c86a291d` |
| `public/Fonts/JetBrainsMono-SemiBoldItalic.woff2` | 42244 | `c917ddc5d2e1cc3bae88fd6cb79da7e4d26b74125b93a2900d3106cfa23df46f` |
| `public/Fonts/JetBrainsMono-Thin.eot` | 136228 | `faa29cecb0eb59fd079f555ee824b3d383ec5db6b91f904f092b9b85e5abfe4d` |
| `public/Fonts/JetBrainsMono-Thin.ttf` | 136012 | `e73be000723c883a17d9b341dc4d789984ab6d4cd212135f322fa6ee43075ba2` |
| `public/Fonts/JetBrainsMono-Thin.woff` | 55432 | `d33589874f133d51fe2f32ca3a465624bca9fed9bff7cb7d824c7b07e9f509ef` |
| `public/Fonts/JetBrainsMono-Thin.woff2` | 38508 | `77de1b1467f55d7b59983e55a5064d539ebe2f52155204d6cdff87852b46be3c` |
| `public/Fonts/JetBrainsMono-ThinItalic.eot` | 138996 | `290e94a23f47bde2e3225330c1dd0c41aec58f6799730b888dafe507410f10ee` |
| `public/Fonts/JetBrainsMono-ThinItalic.ttf` | 138768 | `cc62d390dcdd8077ed184492c9a82e293eff6690866e63938f2110bb6cb04163` |
| `public/Fonts/JetBrainsMono-ThinItalic.woff` | 58932 | `13e1cf68e83811f85044959f72d902d8665878e9550320b331aa4458c2a3a0e5` |
| `public/Fonts/JetBrainsMono-ThinItalic.woff2` | 40856 | `71817d8854fc50496a2443a5629569d1495ea5a7a8df909d1b082e79b13685ee` |
| `public/Fonts/Vazir-Code.eot` | 128358 | `e42e5525797995219cda4264571f179f1e9d37cf0c35e25c3a40af96aa480ebc` |
| `public/Fonts/Vazir-Code.ttf` | 128184 | `9fade07054fa2380732dbfeca5fb06fffb5904051bf9fb29faca522fdaece662` |
| `public/Fonts/Vazir-Code.woff` | 67072 | `93813a4ecc87197bc04ce057049c63448e4e5f959c23d4e6c8e218b9cd3c0e8a` |
| `public/Fonts/Vazir-Code.woff2` | 49648 | `71736835993feb5e93a810439057799e0f60bc79ba90fe3527142a56afa054df` |
| `public/apple-touch-icon.png` | 6963 | `f528f83b64655a9ae464176b4503821ebdf61fb9fd3656feebc20c45e29e1c9a` |
| `public/favicon.ico` | 15406 | `4a13dcabbe90ce19fe39fc9f6607612ccf8053d60a81a1c15b1f3d6d3bdcd27c` |
| `public/resume.pdf` | 279876 | `26b5888c8df0f6ea6b4d7d8bc10772f1d2e21797aec78eefeac7c5734e169b9b` |
| `src/Components/AboutMe/AboutMe.tsx` | 1435 | `42738d774b97cd0839b2808c95985c4c9495ce61e8d25268f6e2fa721b02677f` |
| `src/Components/Certificate/Certificate.tsx` | 2078 | `6c61f2cfdd8501f0bd8ed36c553a276dd37fbe29577041b7e796e6ce45484691` |
| `src/Components/Certificate/Label.tsx` | 385 | `2724eaa98d83b694588af083df848d56f469c0f209fe1b44ac85d16d70f2a22c` |
| `src/Components/Certificate/Types.ts` | 329 | `3a1892de224be3e90c4cdb3bbeacb87abf6d4c92a02ab18cb91416754f5e498d` |
| `src/Components/DailyQuote/DailyQuote.tsx` | 666 | `150fc60db61f750131a22743ffbfa0e9b2b8a6e160ca36dee7419dcc1957983e` |
| `src/Components/DailyQuote/Types.ts` | 78 | `0acfded811da9869e0b60797791ad2e667b460274635375da4f5d6d803a702e7` |
| `src/Components/DownloadResume/DownloadResume.tsx` | 564 | `65632b7a5b7d2ddee1c578b85982a909ed95799acc5ba3328ca8703dc5651080` |
| `src/Components/GetInTouch/GetInTouch.tsx` | 4196 | `8ce46558e3886212e3b80b20a1ccc33ca844db802b6332a58f8328aaef20eee5` |
| `src/Components/GetInTouch/Types.ts` | 141 | `b79bef969bee3e6dc1e631310855ec3b3c97288505c737711c7fc72bb1ff38cc` |
| `src/Components/Hero/Hero.tsx` | 1079 | `fbce31d4738be6d4154a7008e028157cd9b091d851d8640301cbe0488ea2d8a6` |
| `src/Components/Layout/Background/CodeParticlesBackground.tsx` | 5449 | `3de3beb29af20a5fd201eea346c2a95f77e95a2650d90bbc5dac5e2728ef3f97` |
| `src/Components/Layout/Footer/Footer.tsx` | 2514 | `485756cae9a71b5c444d6c746a9648cc8106d61d643166bacc7b0a99508ef77d` |
| `src/Components/Layout/Header/Header.tsx` | 2800 | `e9ad6a05183d8ce3655677183ff59087b2087eadc7b02fbfcbe43c7b0c285a01` |
| `src/Components/Layout/MainLayout.tsx` | 542 | `878ae0259e926485cbd08d9dd6e6f0f1530b3ca6b0abe57cf37a50038947612e` |
| `src/Components/Layout/Types.ts` | 156 | `bb13fc18f49fe2a5d01526e5855bfcb64f0a715d1f1f87f3d09dc1f08981a188` |
| `src/Components/Projects/ProjectCard.tsx` | 3310 | `a1c3f95733e28be3bb628ffa736fc3b326755c54cec143c0f2286a6d4d856be9` |
| `src/Components/Projects/Projects.tsx` | 1600 | `7ec9d7519a496d1181746305a4ed8df8ae129e451e11bc89e3cedbd5206fbf90` |
| `src/Components/Projects/Types.ts` | 220 | `cd9015aeb2a9cd1a19c77159e57e862bd1243ce9841ed3f46706bdc4bdbe9b9b` |
| `src/Components/RubikCube/RubikCube.tsx` | 10513 | `1fc3073686f7436b7bfce4cfbd71bcc039a745c71a67598cc36452a3879c9ffd` |
| `src/Components/RubikCube/Types.ts` | 146 | `0cf7a30fb618249749e43d986680ba4411064b70983e13a605547a15cda19caf` |
| `src/Components/Skills/Skills.tsx` | 1815 | `6408ba16e0df3680e5b90f999ca22e6f13b7301b8fd96db9ed70dd001490513c` |
| `src/Components/Skills/Types.ts` | 159 | `17a078fc091ad9e7f7288fd215e9ac42fd3fbe3487e3e57069554e74ed4ca2a7` |
| `src/Components/SmoothScroll/SmoothScroll.tsx` | 1453 | `f4f692b5d2253bad24c92937cf05f0d7f4bc60c4625372b3ec244263117e415e` |
| `src/Components/Toast/Toast.tsx` | 1862 | `44562de9d8d64fb6c9a928733a48b527fb4c6a768982c370418eeecef266a9f7` |
| `src/Components/UI/Buttons/CustomBTN.tsx` | 1926 | `854c7c891a5bc8764ea31ddef49af8d75fa2bf9ebaac2534e7e172f7faa41f05` |
| `src/Components/UI/Buttons/ThemeToggle.tsx` | 1382 | `7280218ac30db33be0bedf62e9b61e5815b36009be4d850daf6256094ccf73d3` |
| `src/Components/UI/Buttons/Types.ts` | 232 | `72b6236d5b6fa424eca552fdc11ffc50e8f79ab8f14c493844c9cb5289223ab3` |
| `src/Components/UI/CodeTyleText/CodeTyleText.tsx` | 2479 | `3f1637648de29f6488c8ab0afaaa62292240d52ea0cc2e5306b516d7d26c51d1` |
| `src/Components/UI/CodeTyleText/Types.ts` | 234 | `d8aacafb93d655671666a680e56b997f407fc33b795284caf97ad0c3a33a046c` |
| `src/Components/UI/Custom/Cursor.tsx` | 2644 | `2245f8bed761fabde5e2343db375906f1e21b32fedc59a5612080f5916b83e71` |
| `src/Components/UI/Custom/Select.tsx` | 2544 | `678bc48ada994590110eb0df595dd01e2b46622b5b5614fb17cabb200ba041d1` |
| `src/Components/UI/Custom/Types.ts` | 219 | `9e54928eaf74febd86999708c45cc667a5e6ec395d2d0bd66f35526274a4af57` |
| `src/Components/UI/Devider/Devider.tsx` | 221 | `3711f91b3d2a0fe00331dbe1b4c525826fdc37fcdade34399b482b15c8a9a157` |
| `src/Components/UI/Links/Links.tsx` | 1146 | `2ba2e71bbd82d20d95190ce0308b4354caec0a724beb45df6d9e92c10b36d8b4` |
| `src/Components/UI/Links/Types.ts` | 107 | `fe90b079b7c7bece6fdbb73681519c5d8f8fcd4b1bc84bd3539a449e261d2fb3` |
| `src/Components/UI/ScrumbleText/ScrumbleText.tsx` | 2567 | `28169e4cd29b7540b98006fcced261f7b8fada77e079774bebdbc3964a3427cf` |
| `src/Components/UI/ScrumbleText/Types.ts` | 153 | `d7c40a57632557f4cdab9df2059b8e03554db90a1cb763e3ee8bd0465dfc5405` |
| `src/Components/UI/TextArea/TextArea.tsx` | 308 | `102962763b3148c03af01deceaca5a6b7de9d9a331005538787681d4b82c3ff4` |
| `src/Components/UI/Tooltip/Tooltip.tsx` | 1651 | `28b8919e8e807a4e605adea60703dbf6b18dbaa240817ad26ef0c7ab009a26d5` |
| `src/Components/UI/Tooltip/Types.ts` | 116 | `9f65d4e3066505b07dbd7ad8a74e08169fa47752742b812f7b4ffc27679a4131` |
| `src/Contexts/ThemeContext.tsx` | 1764 | `d33fd9229d733a6f2d839a5857dad1d799f885df1f8959ee640749071072e2ea` |
| `src/DataBase/Certificate.json` | 1863 | `0f4ec8e7e5904749e26a0dd259f9c88786c134fbe1553c09c76e569c551fef5a` |
| `src/DataBase/DailyQuote.json` | 5355 | `c6ce1fc1682c3fd69772cfde206fd01b77359557338ece23be92829277c8eaac` |
| `src/DataBase/Projects.json` | 4384 | `5390f27f3319684af9de42b86464e0fdf9e976c3eb41e9f50b28abcbc24dbc6d` |
| `src/DataBase/Skills.json` | 2094 | `b9f193136a2b6c0bc2b13d46d15525b4a65c3aa1274cba047bb99d8bcb4ee13a` |
| `src/Hooks/useAutoLang.tsx` | 494 | `172c02e1d62e7ced41b00f595667c5d032b37548bf48bec9e75d29136cd0fbce` |
| `src/Schemas/ContactUsForm.ts` | 316 | `f833dc7ad882f5956e0578477f1d028be8eb11e3893a0e3728e9e4dc434ce0db` |
| `src/Utils/Age.ts` | 466 | `68f0daca27030a93a14864d0cb987642ef3e93d1bd0a6097b121533b7fea40d3` |
| `src/Utils/getGithubStats.ts` | 1136 | `860497dc9bcb89ca6839aded74630d4435e6aa629f87b6d9b2e3bd08de72ed9e` |
| `src/Utils/getTextColor.ts` | 479 | `4505eb70f31699f97eeefb032b7998f1bbd2b931d5b01ab231eb096cef32bf67` |
| `src/app/(Home Page)/layout.tsx` | 324 | `3eb37a78cdb88d5de5a49737799fc37dc4cbb1806ca8862942c51b6899e4b81c` |
| `src/app/(Home Page)/page.tsx` | 749 | `4918a7cc2f0da39ccfadd3382afdc5ca179d1c41f22e36b1eb569c998b1f3f58` |
| `src/app/(Other Pages)/layout.tsx` | 316 | `43ee8b8cc2060d4ec520490f9e264195c242cdcbc8c95c70d45f9cd3be13b41a` |
| `src/app/(Other Pages)/projects/page.tsx` | 4250 | `4c6b7eb5a72889411d9d4be165d8056b8e025121e58954201375dd7e8212fd33` |
| `src/app/globals.css` | 10294 | `b6872ae4ade8166b1951b58e3b119da53f0b435e0fbf250d6736f6080ec74faf` |
| `src/app/layout.tsx` | 1110 | `6fae1084cc9d4bae59b6d7fd0bc08e1fbe42f5e73db47c35a1eefa39976c75ef` |
| `src/app/not-found.tsx` | 1095 | `f1b53612c24e8af9d653cee0dfb6086b7ff9d91109cf6b9fe9ba2a8b6394af76` |
| `src/features/admin/.gitkeep` | 1 | `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b` |
| `src/features/blog/.gitkeep` | 1 | `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b` |
| `src/features/portfolio/.gitkeep` | 1 | `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b` |
| `src/features/shared/.gitkeep` | 1 | `01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b` |
