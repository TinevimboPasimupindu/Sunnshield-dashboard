"""
Zimbabwe National ID Number — Parser, Validator, and Auto-Corrector
=====================================================================

FORMAT
------
    RR-NNNNNNN-L-DD

    RR   : 2-digit district-of-REGISTRATION code
    N... : 6 or 7 digit sequence number (total ID length is always 11 or 12 chars)
    L    : check letter (mod-23 checksum over RR+sequence, letters I and O skipped)
    DD   : 2-digit district-of-ORIGIN code (00 = foreign national / non-indigenous)

    Accepted raw layouts (hyphens/spaces optional, case-insensitive):
        63-1234567-K-00
        631234567K00
        63 1234567 K 00

CHECKSUM
--------
    combined = int(str(RR) + str(sequence_number))      # e.g. "12" + "345678" -> 12345678
    remainder = combined % 23
    letter = LETTER_TABLE[remainder]

    LETTER_TABLE (remainder -> letter), I and O never appear:
        0:Z 1:A 2:B 3:C 4:D 5:E 6:F 7:G 8:H 9:J 10:K 11:L
        12:M 13:N 14:P 15:Q 16:R 17:S 18:T 19:V 20:W 21:X 22:Y

DISTRICT CODES
--------------
    RR and DD both draw from the same district-code list (Fourth Schedule,
    National Registration Regulations 1977, as amended). Populate
    DISTRICT_CODES below with the full official list for your deployment —
    a starter set is included from the regulations text.

CORRECTION STRATEGY
--------------------
This is a constrained-search corrector, not a guesser: it only proposes a
fix that (a) matches known OCR/typing confusions, (b) satisfies the mod-23
checksum, and (c) keeps RR/DD within the known district-code table. If
several corrections are equally plausible, all are returned, ranked by
edit cost, so a human/downstream step makes the final call rather than the
code silently picking one.
"""

import re
from itertools import product

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

LETTER_TABLE = {
    0: "Z", 1: "A", 2: "B", 3: "C", 4: "D", 5: "E", 6: "F", 7: "G", 8: "H",
    9: "J", 10: "K", 11: "L", 12: "M", 13: "N", 14: "P", 15: "Q", 16: "R",
    17: "S", 18: "T", 19: "V", 20: "W", 21: "X", 22: "Y",
}
REMAINDER_FOR_LETTER = {v: k for k, v in LETTER_TABLE.items()}
VALID_LETTERS = set(LETTER_TABLE.values())  # excludes I and O

# Starter district-code table — extend this with the full Fourth Schedule
# list for your deployment (province by province, per the 1977 regs as
# amended). Codes are strings to preserve leading zeros.
DISTRICT_CODES = {
    "08": "Bulawayo", "63": "Harare",
    "07": "Buhera", "44": "Chimanimani", "13": "Chipinge", "42": "Makoni",
    "75": "Mutare", "50": "Mutasa", "34": "Nyanga",
    "05": "Bindura", "71": "Guruve", "15": "Mazowe", "45": "Mt Darwin",
    "11": "Muzarabani", "61": "Rushinga", "68": "Shamva",
    "18": "Chikomba", "25": "Goromonzi", "80": "Hwedza", "43": "Marondera",
    "49": "Mudzi", "47": "Murehwa", "48": "Mutoko", "59": "Seke", "85": "UMP",
    "32": "Chegutu", "38": "Hurungwe", "24": "Kadoma", "37": "Kariba",
    "70": "Makonde", "86": "Zvimba",
    "04": "Bikita", "14": "Chiredzi", "12": "Chivi", "27": "Gutu", "22": "Masvingo",
    "54": "Mwenezi", "83": "Zaka",
    "06": "Binga", "35": "Bubi", "79": "Hwange", "41": "Lupane",
    "53": "Nkayi", "73": "Tsholotsho", "84": "Umguza",
    "02": "Beitbridge", "56": "Bulilimamangwe", "28": "Gwanda",
    "21": "Insiza", "39": "Matobo", "19": "Umzingwane",
    "77": "Chirumanzu", "26": "Gokwe North", "23": "Gokwe South",
    "29": "Gweru", "58": "Kwekwe", "03": "Mberengwa", "66": "Shurugwi",
    "67": "Zvishavane",
    "00": "Foreign national / non-indigenous record",
}

# Common OCR / manual-typing confusions (bidirectional), used to generate
# correction candidates for a single wrong character.
DIGIT_CONFUSIONS = {
    "0": ["8", "6", "9", "O"], "1": ["7", "l", "I"], "2": ["7", "z"],
    "3": ["8"], "5": ["6", "8", "S"], "6": ["5", "0", "8", "G"],
    "7": ["1", "2"], "8": ["3", "0", "6", "9", "B"], "9": ["0", "8", "g"],
}
LETTER_CONFUSIONS = {
    "B": ["8"], "G": ["6"], "S": ["5"], "Z": ["2"],
}

ID_RE = re.compile(
    r"^\s*(\d{2})[\s\-]?(\d{6,7})[\s\-]?([A-Za-z])[\s\-]?(\d{2})\s*$"
)


# ---------------------------------------------------------------------------
# Core data structure
# ---------------------------------------------------------------------------

class ParseResult:
    def __init__(self, raw):
        self.raw = raw
        self.registration_code = None
        self.sequence_number = None
        self.check_letter = None
        self.district_code = None
        self.format_ok = False
        self.checksum_ok = False
        self.registration_district_known = False
        self.origin_district_known = False
        self.errors = []
        self.corrections = []  # list of (corrected_id_string, notes, cost)

    @property
    def formatted(self):
        if not self.format_ok:
            return None
        return f"{self.registration_code}-{self.sequence_number}-{self.check_letter}-{self.district_code}"

    @property
    def is_fully_valid(self):
        return (
            self.format_ok
            and self.checksum_ok
            and self.registration_district_known
            and self.origin_district_known
        )

    def __repr__(self):
        return (
            f"ParseResult(raw={self.raw!r}, formatted={self.formatted!r}, "
            f"valid={self.is_fully_valid}, errors={self.errors})"
        )


def compute_check_letter(registration_code: str, sequence_number: str) -> str:
    combined = int(registration_code + sequence_number)
    remainder = combined % 23
    return LETTER_TABLE[remainder]


def parse(raw: str) -> ParseResult:
    """Parse and validate a Zimbabwe ID number without attempting correction."""
    result = ParseResult(raw)
    cleaned = raw.strip()
    m = ID_RE.match(cleaned)
    if not m:
        result.errors.append("Does not match RR-NNNNNN(N)-L-DD structure")
        return result

    reg, seq, letter, dist = m.groups()
    letter = letter.upper()

    result.registration_code = reg
    result.sequence_number = seq
    result.check_letter = letter
    result.district_code = dist
    result.format_ok = True

    if letter not in VALID_LETTERS:
        result.errors.append(f"Check letter '{letter}' is not a valid letter (I/O excluded)")
    else:
        expected = compute_check_letter(reg, seq)
        if expected == letter:
            result.checksum_ok = True
        else:
            result.errors.append(f"Check letter mismatch: got '{letter}', expected '{expected}'")

    if reg in DISTRICT_CODES:
        result.registration_district_known = True
    else:
        result.errors.append(f"Registration code '{reg}' not found in district table")

    if dist in DISTRICT_CODES:
        result.origin_district_known = True
    else:
        result.errors.append(f"District-of-origin code '{dist}' not found in district table")

    return result


# ---------------------------------------------------------------------------
# Correction
# ---------------------------------------------------------------------------

def _candidate_chars(ch: str, pool: dict) -> list:
    """Chars this one is commonly confused with, plus itself."""
    out = {ch}
    for a, others in pool.items():
        if ch == a:
            out.update(others)
        if ch in others:
            out.add(a)
    return list(out)


def suggest_corrections(raw: str, max_results: int = 5) -> ParseResult:
    """
    Parse `raw`; if invalid, search nearby strings (single-character
    substitutions drawn from known OCR/typing confusions, plus the two
    valid sequence lengths) for ones that pass ALL checks: format,
    mod-23 checksum, and both district codes present in DISTRICT_CODES.

    Returns the ParseResult for the original input, with `.corrections`
    populated as a ranked list of (corrected_id, notes, edit_cost).
    Does not silently return a "best guess" as fact — surface the ranked
    candidates and let a human or a confidence threshold decide.
    """
    result = parse(raw)
    if result.is_fully_valid:
        return result

    # Only attempt correction if we can extract 4 loose groups at all,
    # tolerating a missing/extra digit in the sequence portion.
    cleaned = re.sub(r"[\s\-]", "", raw.strip()).upper()
    loose = re.match(r"^(\d{2})(\d{5,8})([A-Z])(\d{2})$", cleaned)
    if not loose:
        result.errors.append("Too malformed to attempt structured correction")
        return result

    reg0, seq0, letter0, dist0 = loose.groups()

    candidates = []

    def try_candidate(reg, seq, letter, dist, cost, notes):
        if len(seq) not in (6, 7):
            return
        if letter not in VALID_LETTERS:
            return
        cand_str = f"{reg}-{seq}-{letter}-{dist}"
        parsed = parse(cand_str)
        if parsed.is_fully_valid:
            candidates.append((cand_str, notes, cost))

    # 1) Try as-is with both plausible sequence lengths (in case a digit
    #    is missing/extra at the boundary) — no character substitution.
    for seq_variant, note in [(seq0[:6], "trimmed to 6-digit sequence"),
                               (seq0[:7], "trimmed to 7-digit sequence")]:
        if len(seq0) >= len(seq_variant):
            try_candidate(reg0, seq_variant, letter0, dist0, 1, note)

    # 2) Single-character substitution on the check letter only
    #    (most common failure: checksum mismatch, everything else fine).
    for seq_len in (6, 7):
        seq = seq0[:seq_len] if len(seq0) >= seq_len else seq0.ljust(seq_len, seq0[-1])
        if len(seq) != seq_len:
            continue
        expected_letter = compute_check_letter(reg0, seq) if reg0.isdigit() else None
        if expected_letter and expected_letter != letter0:
            try_candidate(reg0, seq, expected_letter, dist0, 1,
                          f"recomputed check letter from RR+sequence ({seq_len}-digit)")

    # 3) Single-digit substitution in registration or district code,
    #    constrained to the known district table + confusion pairs.
    for pos, code in [("reg", reg0), ("dist", dist0)]:
        for i in range(2):
            for repl in _candidate_chars(code[i], DIGIT_CONFUSIONS):
                if not repl.isdigit() or repl == code[i]:
                    continue
                new_code = code[:i] + repl + code[i + 1:]
                if new_code not in DISTRICT_CODES:
                    continue
                if pos == "reg":
                    letter_fix = compute_check_letter(new_code, seq0[:7]) if len(seq0) >= 7 else compute_check_letter(new_code, seq0[:6])
                    try_candidate(new_code, seq0[:7], letter_fix, dist0, 2,
                                  f"registration code '{code}'->'{new_code}' ({DISTRICT_CODES[new_code]}), letter recomputed")
                    try_candidate(new_code, seq0[:6], letter_fix, dist0, 2,
                                  f"registration code '{code}'->'{new_code}' ({DISTRICT_CODES[new_code]}), letter recomputed")
                else:
                    try_candidate(reg0, seq0[:7], letter0, new_code, 2,
                                  f"district code '{code}'->'{new_code}' ({DISTRICT_CODES[new_code]})")
                    try_candidate(reg0, seq0[:6], letter0, new_code, 2,
                                  f"district code '{code}'->'{new_code}' ({DISTRICT_CODES[new_code]})")

    # 4) Combine a district-code fix with a recomputed check letter
    #    (covers: wrong district digit AND stale checksum together).
    for pos, code in [("reg", reg0)]:
        for i in range(2):
            for repl in _candidate_chars(code[i], DIGIT_CONFUSIONS):
                if not repl.isdigit() or repl == code[i]:
                    continue
                new_code = code[:i] + repl + code[i + 1:]
                if new_code not in DISTRICT_CODES:
                    continue
                for seq_len in (6, 7):
                    seq = seq0[:seq_len]
                    if len(seq) != seq_len:
                        continue
                    letter_fix = compute_check_letter(new_code, seq)
                    try_candidate(new_code, seq, letter_fix, dist0, 3,
                                  f"registration '{code}'->'{new_code}', letter recomputed, seq {seq_len} digits")

    # De-dupe, sort by cost then alphabetically, cap results
    seen = set()
    ranked = []
    for cand_str, notes, cost in sorted(candidates, key=lambda c: (c[2], c[0])):
        if cand_str in seen:
            continue
        seen.add(cand_str)
        ranked.append((cand_str, notes, cost))
        if len(ranked) >= max_results:
            break

    result.corrections = ranked
    return result


# ---------------------------------------------------------------------------
# CLI / self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    samples = [
        "63-1234567-K-00",           # will show as checksum-invalid unless it happens to satisfy mod23
        "63 1234567 K 00",
        "631234567K00",
        "63-1234567-Q-00",           # wrong check letter
        "68-1234567-K-00",           # possibly-wrong registration code (if 68 not adjacent to 63 by confusion)
        "63-1234567-K-99",           # unknown district code
        "6-31234567-K-00",           # malformed spacing
    ]
    for s in samples:
        r = parse(s)
        print(f"\nINPUT: {s!r}")
        print(f"  parsed:    {r.formatted}")
        print(f"  valid:     {r.is_fully_valid}")
        if r.errors:
            print(f"  errors:    {r.errors}")
        if not r.is_fully_valid:
            r2 = suggest_corrections(s)
            if r2.corrections:
                print("  suggested corrections:")
                for cand, notes, cost in r2.corrections:
                    print(f"    -> {cand}  (cost={cost}, {notes})")
            else:
                print("  suggested corrections: none found")
