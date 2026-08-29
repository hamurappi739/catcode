"use strict";

const V6_BASE_SKIN = Object.freeze({
  id: "snowball",
  name: { ru: "\u0421\u043d\u0435\u0436\u043e\u043a", en: "Snowball" },
  preview: "01-snowball.png",
  base: "#fbfcff",
  shade: "#d7e3f5",
  // Idle head keeps the authored iris; the shared gaze canvas paints only
  // the moving pupil on top of the pupil-free head layer.
  idleGazeBaseWithoutPupils: true,
});

// Owner-authored exact PNG family. Runtime never recolours these assets.
const V6_GINGER_SKIN = Object.freeze({
  id: "ginger-owner-v1.1",
  name: { ru: "\u0420\u044b\u0436\u0438\u0439", en: "Ginger" },
  preview: "13-ginger-owner-v1.1.png",
  base: "#e8a05c",
  shade: "#c47a3a",
  eyePalette: Object.freeze({
    iris: "#48dfe1",
    irisLight: "#8ff7f1",
    pupil: "#092d3a",
  }),
  idleHeadLayers: true,
  idleGazeBaseWithoutPupils: true,
});

// Owner black skins: recolour-only family with pupil-cleared idle/hunt gaze bases.
const V6_BLACK_SKIN = Object.freeze({
  id: "black-owner-v1",
  name: { ru: "\u0427\u0435\u0440\u043d\u044b\u0439", en: "Black" },
  preview: "15-black-owner-v1.png",
  base: "#1a1a1a",
  shade: "#2e2e2e",
  eyePalette: Object.freeze({
    iris: "#f5bf2d",
    irisLight: "#ffe08a",
    pupil: "#080a0e",
  }),
  idleHeadLayers: true,
  idleGazeBaseWithoutPupils: true,
  liveGazeRecolorOnly: true,
});

const V6_DEEP_BLACK_SKIN = Object.freeze({
  id: "deep-black-owner-v1",
  name: {
    ru: "\u0413\u043b\u0443\u0431\u043e\u043a\u0438\u0439 \u0447\u0435\u0440\u043d\u044b\u0439",
    en: "Deep Black",
  },
  preview: "16-deep-black-owner-v1.png",
  base: "#0a0a0a",
  shade: "#1c1c1c",
  eyePalette: Object.freeze({
    iris: "#f5bf2d",
    irisLight: "#ffe08a",
    pupil: "#080a0e",
  }),
  idleHeadLayers: true,
  idleGazeBaseWithoutPupils: true,
  liveGazeRecolorOnly: true,
});

const V6_CUSTOM_PALETTE_SKIN = Object.freeze({
  id: "custom-palette-v1",
  name: { ru: "Мой окрас", en: "My palette" },
  preview: "15-black-owner-v1.png",
  base: "#12161d",
  shade: "#0a0c10",
  eyePalette: Object.freeze({
    iris: "#f5bf2d",
    irisLight: "#f5bf2d",
    pupil: "#080a0e",
  }),
  // Black Canonical pupil-free head/hunt bases; iris comes from palette recolour
  // on head layers. Gaze canvas paints pupil-only (same model as black-owner-v1).
  idleHeadLayers: true,
  idleGazeBaseWithoutPupils: true,
  liveGazeRecolorOnly: true,
  customPalette: true,
});

function recolorOnlySkin(spec) {
  return Object.freeze({
    id: spec.id,
    name: Object.freeze(spec.name),
    preview: spec.preview,
    base: spec.base,
    shade: spec.shade,
    eyePalette: Object.freeze(spec.eyePalette),
    idleHeadLayers: true,
    idleGazeBaseWithoutPupils: spec.idleGazeBaseWithoutPupils !== false,
    liveGazeRecolorOnly: true,
  });
}

const V6_SIAMESE_SEAL_SKIN = recolorOnlySkin({
  id: "siamese-seal-owner-v1",
  name: { ru: "Сиамский сил-пойнт", en: "Siamese Seal" },
  preview: "17-siamese-seal-owner-v1.png",
  base: "#eccb9d",
  shade: "#39190d",
  eyePalette: { iris: "#117ad2", irisLight: "#5da5e0", pupil: "#000000" },
});
const V6_BRITISH_BLUE_SKIN = recolorOnlySkin({
  id: "british-blue-owner-v1",
  name: { ru: "Британский голубой", en: "British Blue" },
  preview: "18-british-blue-owner-v1.png",
  base: "#72809c",
  shade: "#45546f",
  eyePalette: { iris: "#f5a11b", irisLight: "#f8bf64", pupil: "#000000" },
});
const V6_CREAM_HONEY_SKIN = recolorOnlySkin({
  id: "cream-honey-owner-v1",
  name: { ru: "Кремовый мёд", en: "Cream Honey" },
  preview: "20-cream-honey-owner-v1.png",
  base: "#fde5b7",
  shade: "#e5a45b",
  eyePalette: { iris: "#e76e27", irisLight: "#ef9c6c", pupil: "#000000" },
});
const V6_LILAC_SKIN = recolorOnlySkin({
  id: "lilac-owner-v1",
  name: { ru: "Лиловый", en: "Lilac" },
  preview: "21-lilac-owner-v1.png",
  base: "#a893ab",
  shade: "#7e6378",
  eyePalette: { iris: "#f8c84e", irisLight: "#fada87", pupil: "#000000" },
});
const V6_SILVER_SMOKE_SKIN = recolorOnlySkin({
  id: "silver-smoke-owner-v1",
  name: { ru: "Серебряный дым", en: "Silver Smoke" },
  preview: "22-silver-smoke-owner-v1.png",
  base: "#59637a",
  shade: "#566077",
  eyePalette: { iris: "#71f0be", irisLight: "#9ef5d3", pupil: "#000000" },
});
const V6_BLUE_POINT_SKIN = recolorOnlySkin({
  id: "blue-point-owner-v1",
  name: { ru: "Блю-пойнт", en: "Blue Point" },
  preview: "23-blue-point-owner-v1.png",
  base: "#ece1cf",
  shade: "#fcf0da",
  eyePalette: { iris: "#5bc3e1", irisLight: "#8fd6eb", pupil: "#000000" },
});

// Approved solid-colour owner candidates. Every skin has a full 256px PNG
// family, an idle head with baked pupils removed, and the shared live-gaze rig.
const V6_SOLID_COLOUR_SKINS = Object.freeze([
  recolorOnlySkin({
    id: "ocean-blue-owner-v1",
    name: { ru: "Океанский синий", en: "Ocean Blue" },
    preview: "24-ocean-blue-owner-v1.png",
    base: "#0c4e9c", shade: "#06366e",
    eyePalette: { iris: "#f0c56a", irisLight: "#f0c56a", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "amethyst-owner-v1",
    name: { ru: "Аметист", en: "Amethyst" },
    preview: "25-amethyst-owner-v1.png",
    base: "#623096", shade: "#361a53",
    eyePalette: { iris: "#40d2d2", irisLight: "#40d2d2", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "rose-owner-v1",
    name: { ru: "Розовый кварц", en: "Rose Quartz" },
    preview: "26-rose-owner-v1.png",
    base: "#ba6e80", shade: "#663c46",
    eyePalette: { iris: "#6e3caa", irisLight: "#6e3caa", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "jade-owner-v1",
    name: { ru: "Нефрит", en: "Jade" },
    preview: "27-jade-owner-v1.png",
    base: "#1c6e52", shade: "#0f3d2d",
    eyePalette: { iris: "#e6b437", irisLight: "#e6b437", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "sunset-owner-v1",
    name: { ru: "Закат", en: "Sunset" },
    preview: "28-sunset-owner-v1.png",
    base: "#c4483a", shade: "#6c281f",
    eyePalette: { iris: "#96d2eb", irisLight: "#96d2eb", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "indigo-owner-v1",
    name: { ru: "Индиго", en: "Indigo" },
    preview: "29-indigo-owner-v1.png",
    base: "#2a2876", shade: "#171641",
    eyePalette: { iris: "#b4a0e6", irisLight: "#b4a0e6", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "mint-owner-v1",
    name: { ru: "Мята", en: "Mint" },
    preview: "30-mint-owner-v1.png",
    base: "#48a88c", shade: "#285c4d",
    eyePalette: { iris: "#be2846", irisLight: "#be2846", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "sand-owner-v1",
    name: { ru: "Пустынный песок", en: "Desert Sand" },
    preview: "31-sand-owner-v1.png",
    base: "#c4a06e", shade: "#6c583d",
    eyePalette: { iris: "#285abe", irisLight: "#285abe", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "plum-owner-v1",
    name: { ru: "Слива", en: "Plum" },
    preview: "32-plum-owner-v1.png",
    base: "#5c284e", shade: "#32162b",
    eyePalette: { iris: "#96d237", irisLight: "#96d237", pupil: "#000000" },
  }),
  recolorOnlySkin({
    id: "steel-owner-v1",
    name: { ru: "Сталь", en: "Steel" },
    preview: "33-steel-owner-v1.png",
    base: "#78808a", shade: "#42464c",
    eyePalette: { iris: "#d27837", irisLight: "#d27837", pupil: "#000000" },
  }),
]);

// Selector order: established skins, then the ten approved solid-colour skins.
// Pattern candidates, midnight-owner-v1, and three owner-rejected reference skins
// remain on disk but are not selectable.
const V6_SKINS = Object.freeze([
  V6_BASE_SKIN,
  V6_GINGER_SKIN,
  V6_BLACK_SKIN,
  V6_DEEP_BLACK_SKIN,
  V6_BRITISH_BLUE_SKIN,
  V6_CREAM_HONEY_SKIN,
  V6_LILAC_SKIN,
  ...V6_SOLID_COLOUR_SKINS,
  V6_CUSTOM_PALETTE_SKIN,
]);
const V6_DEFAULT_SKIN_ID = V6_BASE_SKIN.id;
const V6_SKIN_IDS = Object.freeze(V6_SKINS.map((skin) => skin.id));
const V6_ARCHIVED_SKINS = Object.freeze({
  "chocolate-owner-v1": {
    id: "chocolate-owner-v1",
  },
  "siamese-seal-owner-v1": V6_SIAMESE_SEAL_SKIN,
  "silver-smoke-owner-v1": V6_SILVER_SMOKE_SKIN,
  "blue-point-owner-v1": V6_BLUE_POINT_SKIN,
});
const V6_ARCHIVED_SKIN_IDS = Object.freeze(Object.keys(V6_ARCHIVED_SKINS));
const V6_SKIN_PREVIEW_DIR = "assets/v6/skins/previews";

function normalizeV6SkinId(value) {
  if (value && typeof value === "object" && typeof value.id === "string") {
    value = value.id;
  }
  if (value === "ginger-owner-v1") return "ginger-owner-v1.1";
  // Retired Midnight and owner-rejected reference skins must never stay selected.
  if (value === "midnight-owner-v1") return V6_DEFAULT_SKIN_ID;
  if (typeof value === "string" && V6_ARCHIVED_SKIN_IDS.includes(value)) {
    return V6_DEFAULT_SKIN_ID;
  }
  return typeof value === "string" && V6_SKIN_IDS.includes(value)
    ? value
    : V6_DEFAULT_SKIN_ID;
}

function getV6Skin(value) {
  const id = normalizeV6SkinId(value);
  return V6_SKINS.find((skin) => skin.id === id) || V6_BASE_SKIN;
}

function getV6SkinPreviewPath(value) {
  return `${V6_SKIN_PREVIEW_DIR}/${getV6Skin(value).preview}`;
}

const catalogApi = {
  V6_SKINS,
  V6_DEFAULT_SKIN_ID,
  V6_SKIN_IDS,
  V6_ARCHIVED_SKINS,
  V6_ARCHIVED_SKIN_IDS,
  V6_SKIN_PREVIEW_DIR,
  normalizeV6SkinId,
  getV6Skin,
  getV6SkinPreviewPath,
};

if (typeof module !== "undefined" && module.exports) module.exports = catalogApi;
if (typeof window !== "undefined") window.CatCodeV6SkinCatalog = catalogApi;
