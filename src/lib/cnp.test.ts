import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOn, applyCnpToLegal, cnpControlDigit, maskCnp, validateCnp } from "./cnp.ts";
import type { CourtCase, LegalCheckResult } from "../types/scoring";

/** Builds a valid CNP from its first 12 digits (appends the control digit). */
const withControl = (first12: string) => first12 + cnpControlDigit(first12);

test("control digit uses the 279146358279 key", () => {
  // 1·2+9·7+0·9+0·1+1·4+0·6+1·3+4·5+0·8+1·2+2·7+3·9 = 135; 135 mod 11 = 3
  assert.equal(cnpControlDigit("190010140123"), 3);
});

test("valid CNP: date, sex, county, masked form", () => {
  const cnp = withControl("190010140123");
  const v = validateCnp(cnp, "2026-11-21");
  assert.equal(v.valid, true);
  if (!v.valid) return;
  assert.equal(v.info.birthDate, "1990-01-01");
  assert.equal(v.info.sex, "M");
  assert.equal(v.info.county, "București");
  assert.equal(v.info.masked, "1900101******");
  assert.equal(maskCnp(cnp), "1900101******");
});

test("2000s century, leap day and female code", () => {
  const v = validateCnp(withControl("604022912345"), "2026-11-21");
  assert.equal(v.valid, true);
  if (v.valid) {
    assert.equal(v.info.birthDate, "2004-02-29");
    assert.equal(v.info.sex, "F");
    assert.equal(v.info.county, "Cluj");
  }
  assert.equal(validateCnp(withControl("605022912345"), "2026-11-21").valid, false); // 2005 is not a leap year
});

test("rejects wrong length, bad date, unknown county, wrong control digit", () => {
  assert.equal(validateCnp("123").valid, false);
  assert.equal(validateCnp(withControl("190023140123"), "2026-11-21").valid, false); // 31 Feb
  assert.equal(validateCnp(withControl("190010199123"), "2026-11-21").valid, false); // county 99
  const good = withControl("190010140123");
  const bad = good.slice(0, 12) + ((Number(good[12]) + 1) % 10);
  assert.equal(validateCnp(bad, "2026-11-21").valid, false);
  assert.equal(validateCnp(withControl("555010140123"), "2026-11-21").valid, false); // born 2055 → future
});

test("ageOn counts full years", () => {
  assert.equal(ageOn("1990-06-15", "2008-06-14"), 17);
  assert.equal(ageOn("1990-06-15", "2008-06-15"), 18);
});

test("applyCnpToLegal excludes a case filed when the administrator was a minor", () => {
  const c = {
    numar: "1/2/2001",
    institutie: "Tribunalul Cluj",
    data: "2001-03-01",
    matchedBy: "administrator",
    kind: "civil_comercial",
    severity: 3,
    deduction: 20,
    confidence: "medie",
  } as unknown as CourtCase;
  const legal = { cases: [c], isFallback: false, legalScore: 80 } as unknown as LegalCheckResult;
  const out = applyCnpToLegal(legal, { birthDate: "1990-01-01", county: "București", masked: "1900101******" }, (r) => ({ ...r, legalScore: 100 }), () => ["Cluj"]);
  assert.equal(out?.cases[0].userVerdict, "contestat");
  assert.equal(out?.legalScore, 100);
});
