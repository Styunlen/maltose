import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FriendCard from "./FriendCard";
import type { FriendWithStatus } from "@lib/friends";

type FriendSource = "legacy" | "astrahub";

describe("FriendCard", () => {
  it("shows the AstraHub badge only for AstraHub-sourced friends", () => {
    const astraHubFriend = {
      title: "Astra Friend",
      info: "A source-aware friend card",
      link: "https://friend.example.com",
      cover: "https://friend.example.com/avatar.png",
      status: "alive",
      sources: ["legacy", "astrahub"],
    } satisfies FriendWithStatus & { sources: FriendSource[] };

    const legacyFriend = {
      title: "Legacy Friend",
      info: "A legacy friend card",
      link: "https://legacy.example.com",
      cover: "https://legacy.example.com/avatar.png",
      status: "alive",
      sources: ["legacy"],
    } satisfies FriendWithStatus & { sources: FriendSource[] };

    const astraHubMarkup = renderToStaticMarkup(
      React.createElement(FriendCard, {
        friend: astraHubFriend,
        status: astraHubFriend.status,
      }),
    );
    const legacyMarkup = renderToStaticMarkup(
      React.createElement(FriendCard, {
        friend: legacyFriend,
        status: legacyFriend.status,
      }),
    );

    expect(astraHubMarkup).toContain("AstraHub");
    expect(astraHubMarkup).toContain("Imported from AstraHub");
    expect(legacyMarkup).not.toContain("AstraHub");
  });
});
