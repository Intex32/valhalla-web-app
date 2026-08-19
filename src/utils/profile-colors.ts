import type { Profile } from '@/stores/common-store';
import { interpolateHex } from './isochrone-palettes';

/**
 * One base colour per costing model. Routes and isochrones are drawn in the
 * colour of the profile that produced them, which is what makes several
 * profiles legible on the map at the same time.
 */
export const PROFILE_COLORS: Record<Profile, string> = {
  auto: '#2563eb',
  car: '#2563eb',
  emergency: '#dc2626',
  truck: '#d97706',
  bus: '#7c3aed',
  bicycle: '#059669',
  pedestrian: '#db2777',
  motor_scooter: '#0891b2',
  motorcycle: '#4d7c0f',
};

export const getProfileColor = (profile: Profile): string =>
  PROFILE_COLORS[profile];

/**
 * Alternates fade towards white so they read as "same profile, other option"
 * rather than as a different profile.
 */
export const getRouteColor = (profile: Profile, routeIndex: number): string => {
  const base = PROFILE_COLORS[profile];
  if (routeIndex <= 0) return base;
  return interpolateHex(base, '#ffffff', Math.min(0.5, 0.18 * routeIndex));
};

/**
 * Contour shading for a profile's isochrones: near contours light, far
 * contours saturated, all recognisably the same hue.
 */
export const getProfileContourColor = (profile: Profile, t: number): string => {
  const base = PROFILE_COLORS[profile];
  const lightest = interpolateHex(base, '#ffffff', 0.7);
  const darkest = interpolateHex(base, '#000000', 0.25);
  return interpolateHex(lightest, darkest, Math.min(1, Math.max(0, t)));
};

/**
 * Colour for a (instance, profile) target. The profile keeps its hue on every
 * server — car stays blue — while each instance shifts the shade, so the same
 * profile from two servers is still telling apart at a glance. Instance 0 gets
 * the untouched profile colour.
 */
export const getTargetColor = (
  instanceIndex: number,
  profile: Profile
): string => {
  const base = PROFILE_COLORS[profile];
  if (instanceIndex <= 0) return base;

  // Alternate darker / lighter so neighbouring instances never collide.
  const towards = instanceIndex % 2 === 1 ? '#000000' : '#ffffff';
  const amount = Math.min(
    0.6,
    0.32 + 0.14 * Math.floor((instanceIndex - 1) / 2)
  );
  return interpolateHex(base, towards, amount);
};

/** Alternates fade towards white, keeping their target's shade recognisable. */
export const getTargetRouteColor = (
  instanceIndex: number,
  profile: Profile,
  routeIndex: number
): string => {
  const base = getTargetColor(instanceIndex, profile);
  if (routeIndex <= 0) return base;
  return interpolateHex(base, '#ffffff', Math.min(0.5, 0.18 * routeIndex));
};

/** Contour shading for one target's isochrones: near light, far saturated. */
export const getTargetContourColor = (
  instanceIndex: number,
  profile: Profile,
  t: number
): string => {
  const base = getTargetColor(instanceIndex, profile);
  const lightest = interpolateHex(base, '#ffffff', 0.7);
  const darkest = interpolateHex(base, '#000000', 0.25);
  return interpolateHex(lightest, darkest, Math.min(1, Math.max(0, t)));
};
