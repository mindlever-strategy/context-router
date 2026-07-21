"""Simple linear workflow example for Context Router Python SDK."""

from __future__ import annotations

import asyncio

from context_router import ContextRouter


async def research_topic() -> dict:
    return {
        "topic": "Context-efficient agents",
        "findings": ["Share selected facts", "Checkpoint completed work"],
    }


async def write_draft(context: str) -> dict:
    return {"title": "Smaller handoffs, clearer agents", "contextUsed": context}


async def main() -> None:
    async with await ContextRouter.local() as router:
        flow = await router.start("Simple pipeline")
        await flow.set("research", await research_topic())

        handoff = await flow.handoff(keys=["research"], max_tokens=120)
        await flow.set("draft", await write_draft(handoff.summary))

        await flow.checkpoint("draft-created")
        draft = await flow.get("draft")
        await flow.complete()
        print(draft.value)


if __name__ == "__main__":
    asyncio.run(main())
