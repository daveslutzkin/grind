This file details how you do test runs of the sim.

- Test runs are done using the repl.

- Humans run the repl with a random seed, type in commands as they go, and get to the end of the session.

- Agents in preplan mode:

-- Come up with a plan, form a series of actions from the plan, then run the repl piping that series of actions into it.

- Agents in adaptive mode:

-- Start with a queue of a single action.

-- Pipe it into the repl with a known seed.

-- See what happens.

-- Adapt to that.

-- Add one or more actions to the queue.

-- Pipe the new queue into the repl with the known seed.

-- Continue until the session is finished.
