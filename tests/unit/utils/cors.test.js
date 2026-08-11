import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveCorsOrigin } from '../../../src/utils/cors.js';

describe('resolveCorsOrigin', () => {
  describe('when no origins are configured', () => {
    // The point of the whole helper: production must not fall into reflect-any
    // by omission, because reflect-any plus credentials: true is the shape that
    // lets any site make authenticated requests for a logged-in user.
    it('allows same-origin only in production', () => {
      assert.strictEqual(resolveCorsOrigin('', 'production'), false);
    });

    it('reflects the origin in development, so local tooling works', () => {
      assert.strictEqual(resolveCorsOrigin('', 'development'), true);
    });

    it('treats whitespace and empty entries as unset', () => {
      assert.strictEqual(resolveCorsOrigin('  ,  , ', 'production'), false);
    });

    it('defaults to the safe branch when env is missing', () => {
      // Callers pass config.env, which always has a value; this pins the
      // behaviour if that ever stops being true.
      assert.strictEqual(resolveCorsOrigin(undefined, 'production'), false);
    });
  });

  function decide(raw, origin) {
    const fn = resolveCorsOrigin(raw, 'production');
    assert.strictEqual(typeof fn, 'function');
    let result;
    fn(origin, (_err, allowed) => { result = allowed; });
    return result;
  }

  describe('with a single origin', () => {
    const one = 'http://astralrelay.rainierserver.com';

    it('allows it', () => {
      assert.strictEqual(decide(one, one), true);
    });

    // Uses the function form rather than passing the string straight through:
    // the string form emits the same fixed header to every caller, so an
    // allowed and a rejected origin become indistinguishable in a response.
    it('rejects any other origin', () => {
      assert.strictEqual(decide(one, 'https://evil.example'), false);
    });

    it('trims surrounding whitespace', () => {
      assert.strictEqual(decide('  https://a.example  ', 'https://a.example'), true);
    });
  });

  describe('with several origins', () => {
    const origins = 'https://a.example,https://b.example';

    it('allows a listed origin', () => {
      assert.strictEqual(decide(origins, 'https://b.example'), true);
    });

    it('rejects an unlisted origin', () => {
      assert.strictEqual(decide(origins, 'https://evil.example'), false);
    });

    it('allows requests with no Origin header', () => {
      // Same-origin navigations, curl, and the Docker healthcheck send none.
      assert.strictEqual(decide(origins, undefined), true);
    });

    it('does not match on substring', () => {
      assert.strictEqual(decide(origins, 'https://a.example.evil.com'), false);
    });
  });
});
