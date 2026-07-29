type QueueLane = {
  tail: Promise<void>;
  nextPosition: number;
};

declare global {
  var __ticketForgeQueues: Map<string, QueueLane> | undefined;
}

function queues(): Map<string, QueueLane> {
  globalThis.__ticketForgeQueues ??= new Map<string, QueueLane>();
  return globalThis.__ticketForgeQueues;
}

function lane(key: string): QueueLane {
  const store = queues();
  const current = store.get(key);

  if (current) {
    return current;
  }

  const created: QueueLane = {
    tail: Promise.resolve(),
    nextPosition: 1,
  };
  store.set(key, created);
  return created;
}

export async function enqueuePurchase<T>(
  key: string,
  task: () => Promise<T>,
): Promise<{
  position: number;
  result: T;
}> {
  const queue = lane(key);
  const position = queue.nextPosition++;
  const previous = queue.tail;

  let release!: () => void;
  queue.tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return {
      position,
      result: await task(),
    };
  } finally {
    release();
  }
}
