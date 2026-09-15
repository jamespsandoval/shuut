---
name: Private object deletion
description: Durability and concurrency rules for deleting uploaded recordings and other private objects.
---

Database references to private objects may be removed only in the same transaction that records durable cleanup work. Publication, pending-upload expiry, and parent deletion must be serialized so cleanup cannot miss a new child or delete an object that just became live.

**Why:** Object storage and PostgreSQL cannot participate in one atomic transaction. Direct object-first deletion can leave broken database references after a crash, while database-first deletion without a durable queue can permanently strand private recordings. Concurrent publication creates both leak and data-loss races.

**How to apply:** Route all private-object removal through the durable cleanup queue, keep object deletion idempotent and retryable, and use shared transactional locking or atomic row claiming whenever publication and cleanup can target the same object or parent.