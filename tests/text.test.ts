import { describe, expect, it } from "vitest";
import { extractHashtags, extractMentions, tokenizeRichText } from "@/lib/text";

describe("extractHashtags", () => {
  it("finds lowercase deduped tags", () => {
    expect(extractHashtags("Hello #Demo and #demo plus #world")).toEqual(["demo", "world"]);
  });

  it("ignores bare hashes and caps tags at 64 chars", () => {
    expect(extractHashtags("no tags here #")).toEqual([]);
    // The regex matches greedily up to 64 chars, so longer runs truncate.
    expect(extractHashtags(`#${"a".repeat(65)}`)).toEqual(["a".repeat(64)]);
    expect(extractHashtags(`#${"a".repeat(64)}`)).toEqual(["a".repeat(64)]);
  });

  it("supports unicode letters, digits and underscores", () => {
    expect(extractHashtags("#café_42!")).toEqual(["café_42"]);
  });
});

describe("extractMentions", () => {
  it("finds lowercase deduped mentions of valid handles", () => {
    // Periods are part of the handle charset, so trailing ones stick.
    expect(extractMentions("hey @Bob and @bob. and @bob!")).toEqual(["bob", "bob."]);
  });

  it("respects the 3-30 character handle bounds", () => {
    expect(extractMentions("@ab")).toEqual([]);
    expect(extractMentions("@abc")).toEqual(["abc"]);
    // The regex matches greedily up to 30 chars, so longer runs truncate.
    expect(extractMentions(`@${"a".repeat(31)}`)).toEqual(["a".repeat(30)]);
  });
});

describe("tokenizeRichText", () => {
  it("splits text, hashtags and mentions into ordered segments", () => {
    expect(tokenizeRichText("hi @bob #demo")).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", value: "bob" },
      { type: "text", value: " " },
      { type: "hashtag", value: "demo" },
    ]);
  });

  it("keeps plain text intact", () => {
    expect(tokenizeRichText("just words")).toEqual([{ type: "text", value: "just words" }]);
    expect(tokenizeRichText("")).toEqual([]);
  });
});
