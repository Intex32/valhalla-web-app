import { describe, it, expect } from 'vitest';
import { searchParamsSchema, isValidTab } from './route-schemas';

describe('route-schemas', () => {
  describe('searchParamsSchema', () => {
    describe('profile field', () => {
      it('should accept a single bare profile (pre-multi-instance permalinks)', () => {
        const validProfiles = [
          'auto',
          'bicycle',
          'pedestrian',
          'truck',
          'motor_scooter',
        ];

        for (const profile of validProfiles) {
          const result = searchParamsSchema.parse({ profile });
          expect(result.profile).toBe(profile);
        }
      });

      it('should accept an instance-qualified target list', () => {
        const profile = 'public:car,local:emergency';
        expect(searchParamsSchema.parse({ profile }).profile).toBe(profile);
      });

      it('should accept the same profile on two instances', () => {
        const profile = 'public:car,local:car';
        expect(searchParamsSchema.parse({ profile }).profile).toBe(profile);
      });

      it('should accept a list mixing bare and qualified entries', () => {
        const profile = 'car,public:bicycle';
        expect(searchParamsSchema.parse({ profile }).profile).toBe(profile);
      });

      it('should keep the raw string, leaving validation to parseTargets', () => {
        // The schema only guards "is a non-empty string"; unknown instances and
        // costing models are dropped later by `parseTargets`, which is the only
        // place that knows which instances exist.
        expect(searchParamsSchema.parse({ profile: 'nope:nope' }).profile).toBe(
          'nope:nope'
        );
      });

      it('should allow undefined profile (fallback applied by router)', () => {
        const result = searchParamsSchema.parse({});
        expect(result.profile).toBeUndefined();
      });

      it('should fallback to bicycle for an empty or non-string profile', () => {
        expect(searchParamsSchema.parse({ profile: '' }).profile).toBe(
          'bicycle'
        );
        expect(searchParamsSchema.parse({ profile: 42 }).profile).toBe(
          'bicycle'
        );
      });
    });

    describe('per-target costing params', () => {
      it('should not carry costing options any more', () => {
        // use_ferry / use_highways / use_tolls / alternates are per target now
        // and live in the advanced panel, not the URL.
        const result = searchParamsSchema.parse({
          use_ferry: 0.5,
          use_highways: 1,
          use_tolls: 0,
          alternates: 3,
        });

        expect(result).toEqual({});
      });
    });

    describe('wps field', () => {
      it('should accept valid wps string', () => {
        const result = searchParamsSchema.parse({
          wps: '12.34,56.78;90.12,34.56',
        });
        expect(result.wps).toBe('12.34,56.78;90.12,34.56');
      });

      it('should allow undefined wps', () => {
        const result = searchParamsSchema.parse({});
        expect(result.wps).toBeUndefined();
      });
    });

    describe('numeric fields', () => {
      it('should accept valid range value', () => {
        const result = searchParamsSchema.parse({ range: 30 });
        expect(result.range).toBe(30);
      });

      it('should accept valid interval value', () => {
        const result = searchParamsSchema.parse({ interval: 15 });
        expect(result.interval).toBe(15);
      });

      it('should accept valid generalize value', () => {
        const result = searchParamsSchema.parse({ generalize: 200 });
        expect(result.generalize).toBe(200);
      });

      it('should accept valid denoise value', () => {
        const result = searchParamsSchema.parse({ denoise: 0.5 });
        expect(result.denoise).toBe(0.5);
      });

      it('should allow undefined numeric fields', () => {
        const result = searchParamsSchema.parse({});
        expect(result.range).toBeUndefined();
        expect(result.interval).toBeUndefined();
        expect(result.generalize).toBeUndefined();
        expect(result.denoise).toBeUndefined();
      });

      it('should reject non-numeric values for range', () => {
        expect(() => searchParamsSchema.parse({ range: 'invalid' })).toThrow();
      });

      it('should reject non-numeric values for interval', () => {
        expect(() =>
          searchParamsSchema.parse({ interval: 'invalid' })
        ).toThrow();
      });
    });

    describe('lang field', () => {
      it('should accept a supported language tag', () => {
        expect(searchParamsSchema.parse({ lang: 'de-DE' }).lang).toBe('de-DE');
      });

      it('should reject an unsupported language tag', () => {
        expect(() => searchParamsSchema.parse({ lang: 'xx-XX' })).toThrow();
      });
    });

    describe('combined params', () => {
      it('should parse complete valid search params', () => {
        const params = {
          profile: 'public:car,local:emergency',
          wps: '12.34,56.78',
          range: 30,
          interval: 15,
          generalize: 200,
          denoise: 0.5,
          style: 'carto',
        };

        const result = searchParamsSchema.parse(params);

        expect(result).toEqual(params);
      });
    });
  });

  describe('isValidTab', () => {
    it('should return true for directions', () => {
      expect(isValidTab('directions')).toBe(true);
    });

    it('should return true for isochrones', () => {
      expect(isValidTab('isochrones')).toBe(true);
    });

    it('should return true for tiles', () => {
      expect(isValidTab('tiles')).toBe(true);
    });

    it('should return false for invalid tab names', () => {
      expect(isValidTab('invalid')).toBe(false);
      expect(isValidTab('settings')).toBe(false);
      expect(isValidTab('map')).toBe(false);
      expect(isValidTab('')).toBe(false);
    });

    it('should return false for similar but incorrect tab names', () => {
      expect(isValidTab('direction')).toBe(false);
      expect(isValidTab('isochrone')).toBe(false);
      expect(isValidTab('tile')).toBe(false);
      expect(isValidTab('Directions')).toBe(false);
      expect(isValidTab('ISOCHRONES')).toBe(false);
      expect(isValidTab('TILES')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidTab(' directions')).toBe(false);
      expect(isValidTab('directions ')).toBe(false);
      expect(isValidTab('directions\n')).toBe(false);
    });
  });
});
