// Department skins (spec 4.3 theming, 9.1 act palettes): every theme varies the act palette.
// Act 1 beige/grey fluorescent; Act 2 loud brand colours + neon; Act 3 cold navy + archive brown;
// Act 4 gold, marble and ceremonial reds. Never uses the reserved telegraph colours.
import type { Act, ThemeId } from '../../data/ids';
import { ACT_PALETTES } from '../palette';
import { mixHex, shade } from '../../render/canvas';

export type CarpetStyle = 'tiles' | 'stripe' | 'loop' | 'pinstripe' | 'grid' | 'speckle' | 'pattern' | 'diamond';
export type WallStyle = 'plain' | 'panel' | 'stripe' | 'wood' | 'damask' | 'block' | 'slat';

export interface Skin {
  act: Act; theme: ThemeId; key: string;
  carpet: [string, string, string];   // base, light, dark
  carpetFleck: string;
  carpetStyle: CarpetStyle;
  accent: [string, string, string];   // walkway strip / inlay
  lino: [string, string, string];
  tile: [string, string];             // ceramic, grout
  wood: [string, string, string];
  marble: [string, string, string];   // base, vein, inlay
  concrete: [string, string, string];
  raised: [string, string, string];
  core: [string, string, string];     // core floor base, light, dark
  coreInlay: string;
  wallCap: string; wallCapEdge: string; wallFace: string; wallFaceHi: string; wallFaceDark: string; skirting: string;
  wallStyle: WallStyle; wallStripe: string;
  coreCap: string; coreFace: string; coreFaceHi: string; coreFaceDark: string; coreTrim: string;
  partition: string; glassTint: string; cubicle: string; cubicleTrim: string;
  sealedGlass: string; mullion: string;
  // props
  deskTop: string; deskTopHi: string; deskSide: string; metal: string; metalDark: string;
  chair: string; chairHi: string; fabric: string;
  brand: string; brand2: string; screen: string; screenGlow: string;
  plantPot: string; leaf: string; leafHi: string; leafDark: string;
  paper: string; light: string;
  // exterior
  exterior: 'street' | 'city' | 'clouds';
}

type Partial2 = Partial<Skin>;

const BASE: Record<Act, Partial2> = {
  1: {
    carpet: ['#8d9188', '#9da197', '#787c74'], carpetFleck: '#a9ab9f', carpetStyle: 'tiles',
    accent: ['#5d7a8c', '#7393a5', '#4a6272'],
    lino: ['#c4bfb2', '#d4d0c4', '#a9a497'], tile: ['#d8dcd8', '#9aa09c'], wood: ['#9a7650', '#b08a60', '#7a5a3a'],
    marble: ['#e2ddd0', '#c4bcaa', '#b8a46a'], concrete: ['#8e8b84', '#9d9a92', '#76736c'], raised: ['#9aa0a6', '#b0b6bc', '#7a8086'],
    core: ['#a9a59a', '#bdb9ae', '#8f8b80'], coreInlay: '#7a8a8e',
    wallCap: '#e4dece', wallCapEdge: '#b4ac9a', wallFace: '#cfc7b3', wallFaceHi: '#ddd6c4', wallFaceDark: '#a79f8b', skirting: '#6e675c',
    wallStyle: 'panel', wallStripe: '#8aa0a8',
    coreCap: '#9aa6aa', coreFace: '#7d8a8f', coreFaceHi: '#95a2a6', coreFaceDark: '#5f6b70', coreTrim: '#c9c2a8',
    partition: '#e8e2d4', glassTint: '#a6d3e0', cubicle: '#6f7a8c', cubicleTrim: '#a4a8ae', sealedGlass: '#3a5a70', mullion: '#8a9096',
    deskTop: '#cbbd98', deskTopHi: '#dacda9', deskSide: '#9c8f6e', metal: '#9aa0a6', metalDark: '#60666c',
    chair: '#3a3f4c', chairHi: '#535a6a', fabric: '#5d6a7c', brand: '#5d7a8c', brand2: '#c7b26a', screen: '#1c2630', screenGlow: '#7fd0e8',
    plantPot: '#b8b0a0', leaf: '#4f7a3e', leafHi: '#78a456', leafDark: '#2f4f28', paper: '#f2f0e8', light: '#f1f6e4', exterior: 'city',
  },
  2: {
    carpet: ['#3a3f5c', '#474d6e', '#2c3046'], carpetFleck: '#ff6a00', carpetStyle: 'stripe',
    accent: ['#00a89c', '#00d1c1', '#007a72'],
    lino: ['#cfd2dc', '#e0e2ea', '#aeb2c0'], tile: ['#e4e8f0', '#9aa0b4'], wood: ['#8a6a4a', '#a08060', '#6a4a30'],
    marble: ['#e6e6ee', '#bcbccc', '#00d1c1'], concrete: ['#7c7e88', '#8c8e98', '#64666e'], raised: ['#8a90a6', '#a0a6bc', '#6a7086'],
    core: ['#2c3046', '#3a3f5c', '#20233a'], coreInlay: '#00d1c1',
    wallCap: '#f2f0f8', wallCapEdge: '#b4b4cc', wallFace: '#dcdbe8', wallFaceHi: '#ecebf6', wallFaceDark: '#a4a6c0', skirting: '#4c5070',
    wallStyle: 'stripe', wallStripe: '#ff6a00',
    coreCap: '#4c5070', coreFace: '#30344d', coreFaceHi: '#40456a', coreFaceDark: '#20233a', coreTrim: '#00d1c1',
    partition: '#f4f2fa', glassTint: '#9cdcf0', cubicle: '#3d7bff', cubicleTrim: '#c8cce0', sealedGlass: '#2a4a70', mullion: '#9aa0c0',
    deskTop: '#ececf2', deskTopHi: '#ffffff', deskSide: '#b4b6c8', metal: '#a8acc0', metalDark: '#5a5e78',
    chair: '#ff6a00', chairHi: '#ff9040', fabric: '#3d7bff', brand: '#ff6a00', brand2: '#00d1c1', screen: '#141828', screenGlow: '#00d1c1',
    plantPot: '#e8e8f0', leaf: '#3f8a4a', leafHi: '#6ac06a', leafDark: '#24502c', paper: '#f6f6fa', light: '#e9f1ff', exterior: 'city',
  },
  3: {
    carpet: ['#2c3550', '#36405e', '#222a40'], carpetFleck: '#4a5a80', carpetStyle: 'pinstripe',
    accent: ['#8a6a43', '#a8865a', '#6a4e30'],
    lino: ['#8a8676', '#9a9686', '#6e6a5c'], tile: ['#b8bcc4', '#6a7080'], wood: ['#6a4a2c', '#82603c', '#4e341e'],
    marble: ['#c8c0a8', '#9a9078', '#b8925a'], concrete: ['#6a6862', '#7a7872', '#56544e'], raised: ['#5a6070', '#6e7486', '#444a58'],
    core: ['#3a3a42', '#48484f', '#2a2a30'], coreInlay: '#b8925a',
    wallCap: '#4a5878', wallCapEdge: '#2a3450', wallFace: '#3c4a66', wallFaceHi: '#4a5a7a', wallFaceDark: '#2b3650', skirting: '#1a2236',
    wallStyle: 'panel', wallStripe: '#b8925a',
    coreCap: '#3e4250', coreFace: '#2a2e3a', coreFaceHi: '#3a3e4c', coreFaceDark: '#1c1f28', coreTrim: '#b8925a',
    partition: '#8e98ac', glassTint: '#7aa6c8', cubicle: '#4a5470', cubicleTrim: '#8a90a0', sealedGlass: '#203048', mullion: '#5a6278',
    deskTop: '#5a3e26', deskTopHi: '#6e5034', deskSide: '#3e2a18', metal: '#7a808c', metalDark: '#3e424c',
    chair: '#1e2028', chairHi: '#3a3e4a', fabric: '#3a4458', brand: '#b8925a', brand2: '#5a7398', screen: '#0e1420', screenGlow: '#7ab0e8',
    plantPot: '#4a4a52', leaf: '#3a5e40', leafHi: '#5a8a5a', leafDark: '#1e3622', paper: '#e8e2d0', light: '#dfe8ff', exterior: 'city',
  },
  4: {
    carpet: ['#7a1420', '#8e2028', '#5c0e18'], carpetFleck: '#d4a537', carpetStyle: 'pattern',
    accent: ['#d4a537', '#f2d27a', '#a07a20'],
    lino: ['#d8d1c4', '#e9e4dc', '#c2b9aa'], tile: ['#f0ece4', '#c2b9aa'], wood: ['#4a2a1a', '#603824', '#341c10'],
    marble: ['#ece7df', '#c8bfb0', '#d4a537'], concrete: ['#8a8278', '#9a9288', '#726a60'], raised: ['#6a6060', '#807676', '#524848'],
    core: ['#ece7df', '#f8f4ee', '#d4ccbe'], coreInlay: '#d4a537',
    wallCap: '#8a2430', wallCapEdge: '#3a0910', wallFace: '#7a1420', wallFaceHi: '#922030', wallFaceDark: '#5c0e18', skirting: '#d4a537',
    wallStyle: 'damask', wallStripe: '#d4a537',
    coreCap: '#f2ede4', coreFace: '#e0d8ca', coreFaceHi: '#f2ede4', coreFaceDark: '#b8ae9c', coreTrim: '#d4a537',
    partition: '#e9e4dc', glassTint: '#e8c890', cubicle: '#5c0e18', cubicleTrim: '#d4a537', sealedGlass: '#3a2a18', mullion: '#d4a537',
    deskTop: '#2a1a14', deskTopHi: '#3e2a20', deskSide: '#1a100c', metal: '#d4a537', metalDark: '#8a6a20',
    chair: '#7a1420', chairHi: '#a02838', fabric: '#5c0e18', brand: '#d4a537', brand2: '#a01828', screen: '#120a08', screenGlow: '#ffcf7a',
    plantPot: '#d4a537', leaf: '#3a6a3a', leafHi: '#5a8e4a', leafDark: '#1e3a1e', paper: '#f6f0e0', light: '#ffe2b0', exterior: 'clouds',
  },
};

const THEME: Partial<Record<ThemeId, Partial2>> = {
  reception: { carpet: ['#7e8e8a', '#8e9e9a', '#6a7a76'], carpetStyle: 'loop', accent: ['#4f7f8a', '#6a9aa4', '#3e6670'], wallStyle: 'slat', brand: '#4f7f8a' },
  postroom: { carpet: ['#9a958a', '#aaa598', '#827d72'], carpetStyle: 'speckle', accent: ['#c99a2e', '#ddb050', '#a07a1e'], wallFace: '#c8c4b4', wallCap: '#dcd8c8', brand: '#c99a2e', chair: '#5a4a3a' },
  facilities: { carpet: ['#7a7e72', '#8a8e82', '#666a5e'], carpetStyle: 'speckle', accent: ['#c99a2e', '#ddb050', '#a07a1e'], wallStyle: 'block', wallFace: '#bcc2ae', wallFaceHi: '#ccd2be', wallFaceDark: '#949a86', wallCap: '#d2d8c4', brand: '#c99a2e', chair: '#4a4e3a', deskTop: '#9a9a8a', deskTopHi: '#aaaa9a', deskSide: '#6a6a5a' },
  it: { carpet: ['#6a7686', '#7a8696', '#586272'], carpetStyle: 'grid', accent: ['#3e6a9a', '#5a86b8', '#2e5078'], brand: '#3e6a9a', brand2: '#7fd0e8' },
  sales: { carpet: ['#34384f', '#41465f', '#282b3e'], carpetFleck: '#ff6a00', carpetStyle: 'stripe', accent: ['#d85a10', '#ff7a2a', '#a84408'], wallStripe: '#ff6a00', chair: '#d85a10', chairHi: '#ff8a40' },
  marketing: { carpet: ['#4a3c78', '#5a4a8a', '#3a2e60'], carpetFleck: '#00d1c1', carpetStyle: 'speckle', accent: ['#00a89c', '#00d1c1', '#007a72'], wallStripe: '#7a3cff', brand: '#7a3cff', brand2: '#00d1c1', chair: '#00a89c', chairHi: '#30d0c0' },
  customerservice: { carpet: ['#2f4a5c', '#3a586c', '#243a48'], carpetFleck: '#3d7bff', carpetStyle: 'tiles', accent: ['#3d7bff', '#6a9aff', '#2a5ad0'], wallStripe: '#3d7bff', brand: '#3d7bff', chair: '#3a4a6a', chairHi: '#4a5e86' },
  finance: { carpet: ['#2a3350', '#343e5e', '#1f2640'], carpetStyle: 'pinstripe', accent: ['#8a6a43', '#a8865a', '#6a4e30'] },
  legal: { carpet: ['#2e4234', '#3a5040', '#223228'], carpetFleck: '#4a6a50', carpetStyle: 'diamond', wallStyle: 'wood', wallFace: '#5a3e26', wallFaceHi: '#6e4e32', wallFaceDark: '#3e2a18', wallCap: '#6a4a30', wallCapEdge: '#2e1e10', skirting: '#2a1a0c', wallStripe: '#b8925a' },
  compliance: { carpet: ['#3e4450', '#4a5060', '#30353f'], carpetStyle: 'grid', accent: ['#a02828', '#c04040', '#801818'], wallFace: '#4a5670', wallCap: '#5a6680', brand: '#a02828' },
  procurement: { carpet: ['#4a4238', '#585046', '#3a342c'], carpetFleck: '#6a6050', carpetStyle: 'speckle', accent: ['#8a6a43', '#a8865a', '#6a4e30'], wallFace: '#54607a', wallCap: '#64708a' },
  hrhq: { carpet: ['#c8b496', '#d8c4a6', '#b09c7e'], carpetFleck: '#d4a537', carpetStyle: 'loop', wallFace: '#8a2a30', wallFaceHi: '#a03a40', wallFaceDark: '#6a1a20', wallCap: '#9a3440', chair: '#c8a070', chairHi: '#e0b888' },
  executive: { carpet: ['#6a1018', '#7e1a24', '#4e0a12'], carpetStyle: 'pattern', wallFace: '#5c0e18', wallFaceHi: '#741822', wallFaceDark: '#40080e', wallCap: '#6a1420' },
  boardroom: { carpet: ['#4a0c14', '#5e141e', '#36080e'], carpetStyle: 'diamond', wallFace: '#3a0910', wallFaceHi: '#4e1018', wallFaceDark: '#26060a', wallCap: '#4a1018', wallStyle: 'panel' },
  carpark: { carpetStyle: 'speckle', exterior: 'street' },
  basement: { carpetStyle: 'speckle' },
  rooftop: { exterior: 'clouds' },
};

const cache = new Map<string, Skin>();

export function getSkin(theme: ThemeId, act: Act, floorNumber = 6): Skin {
  const ext = floorNumber <= 2 ? 'street' : act === 4 ? 'clouds' : 'city';
  const key = theme + ':' + act + ':' + ext;
  let s = cache.get(key);
  if (s) return s;
  const pal = ACT_PALETTES[act];
  s = { ...(BASE[act] as Skin), ...(THEME[theme] ?? {}), act, theme, key, exterior: ext } as Skin;
  // make sure the act's dominant light is used
  s.light = pal.light;
  if (!s.wallCapEdge) s.wallCapEdge = shade(s.wallCap, -0.3);
  if (!THEME[theme]?.wallFaceHi && THEME[theme]?.wallFace) { s.wallFaceHi = shade(s.wallFace, 0.12); s.wallFaceDark = shade(s.wallFace, -0.22); }
  if (!THEME[theme]?.wallCapEdge && THEME[theme]?.wallCap) s.wallCapEdge = shade(s.wallCap, -0.35);
  s.carpetFleck = s.carpetFleck ?? mixHex(s.carpet[0], '#ffffff', 0.2);
  cache.set(key, s);
  return s;
}
