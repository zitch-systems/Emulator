import type { DevicePreset } from '@/lib/types';

// Device frame presets. Values lifted from DESIGN_SPEC.md.
// width/height are logical CSS px in portrait; dpr is the device pixel ratio;
// radius is the screen corner radius; notch is the cutout style drawn on screen.

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const ANDROID_TAB_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DEVICES: DevicePreset[] = [
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    platform: 'ios',
    width: 393,
    height: 852,
    dpr: 3,
    radius: 55,
    notch: 'island',
    bezel: 14,
    ua: IOS_UA,
    appetizeDevice: 'iphone15pro',
  },
  {
    id: 'iphone-15-pro-max',
    name: 'iPhone 15 Pro Max',
    platform: 'ios',
    width: 430,
    height: 932,
    dpr: 3,
    radius: 55,
    notch: 'island',
    bezel: 14,
    ua: IOS_UA,
    appetizeDevice: 'iphone15promax',
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    platform: 'ios',
    width: 375,
    height: 667,
    dpr: 2,
    radius: 18,
    notch: 'home',
    bezel: 16,
    ua: IOS_UA,
    appetizeDevice: 'iphonese',
  },
  {
    id: 'pixel-8',
    name: 'Pixel 8',
    platform: 'android',
    width: 412,
    height: 915,
    dpr: 2.625,
    radius: 38,
    notch: 'punch',
    bezel: 12,
    ua: ANDROID_UA,
    appetizeDevice: 'pixel8',
  },
  {
    id: 'pixel-8-pro',
    name: 'Pixel 8 Pro',
    platform: 'android',
    width: 448,
    height: 998,
    dpr: 3,
    radius: 42,
    notch: 'punch',
    bezel: 12,
    ua: ANDROID_UA,
    appetizeDevice: 'pixel8pro',
  },
  {
    id: 'galaxy-fold',
    name: 'Galaxy Fold (open)',
    platform: 'android',
    width: 600,
    height: 818,
    dpr: 2.4,
    radius: 26,
    notch: 'seam',
    bezel: 12,
    ua: ANDROID_UA,
    appetizeDevice: 'galaxyfold',
  },
  {
    id: 'ipad-pro-11',
    name: 'iPad Pro 11"',
    platform: 'ios',
    width: 834,
    height: 1194,
    dpr: 2,
    radius: 22,
    notch: 'none',
    bezel: 18,
    ua: IPAD_UA,
    appetizeDevice: 'ipadpro11',
  },
  {
    id: 'android-tablet',
    name: 'Android tablet',
    platform: 'android',
    width: 800,
    height: 1280,
    dpr: 2,
    radius: 20,
    notch: 'none',
    bezel: 18,
    ua: ANDROID_TAB_UA,
    appetizeDevice: 'galaxytabs8',
  },
];

export const DEFAULT_DEVICE = DEVICES[0];

export function getDevice(id: string): DevicePreset {
  return DEVICES.find((d) => d.id === id) ?? DEFAULT_DEVICE;
}

/** Swap width/height for landscape. */
export function orient(d: DevicePreset, landscape: boolean): { w: number; h: number } {
  return landscape ? { w: d.height, h: d.width } : { w: d.width, h: d.height };
}
