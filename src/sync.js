import { decrypt } from './security.js';
import { Meta, collect } from './meta.js';

export function synchronizer(
  store,
  config,
  factory = () => new Meta(config),
) {
  let active = false;

  return {
    get active() {
      return active;
    },

    async run() {
      if (active || config.demo) {
        return;
      }

      const saved = store.get('connection');

      if (!saved || !store.get('installed')) {
        return;
      }

      active = true;

      try {
        const connection = decrypt(
          saved,
          config.encryptionKey,
        );

        const existing = store.db
          .prepare(
            "SELECT * FROM posts WHERE status='published' AND available=1 AND demo=0 ORDER BY seen ASC LIMIT 100",
          )
          .all();

        console.log('SOCIAL SYNC START:', {
          pageId: connection.pageId || null,
          pageName: connection.pageName || null,
          instagramId: connection.igId || null,
          instagramName: connection.igName || null,
          existingPosts: existing.length,
        });

        const result = await collect(
          factory(),
          connection,
          existing,
        );

        console.log('SOCIAL SYNC RESULT:', {
          posts: result.posts.length,
          missing: result.missing.length,
          errors: result.errors,
        });

        if (
          store.get('connection') !== saved ||
          !store.get('installed')
        ) {
          console.log(
            'SOCIAL SYNC CANCELLED: connection changed during sync',
          );

          return;
        }

        store.db.exec('BEGIN');

        try {
          for (const post of result.posts) {
            store.upsert(post);
          }

          for (const id of result.missing) {
            store.db
              .prepare(
                'UPDATE posts SET available=0 WHERE id=?',
              )
              .run(id);
          }

          store.run(
            !result.errors.length,
            result.errors.length
              ? result.errors.join(' | ').slice(0, 1800)
              : `Synced ${result.posts.length} items.`,
          );

          store.db.exec('COMMIT');

          console.log('SOCIAL SYNC SAVED:', {
            posts: result.posts.length,
            missing: result.missing.length,
            errorCount: result.errors.length,
          });

          return {
            ok: result.errors.length === 0,
            posts: result.posts.length,
            missing: result.missing.length,
            errors: result.errors,
          };
        } catch (e) {
          store.db.exec('ROLLBACK');
          throw e;
        }
      } catch (e) {
        console.error('SOCIAL SYNC FAILED:', e);

        store.run(
          false,
          e instanceof Error
            ? e.message
            : String(e),
        );

        return {
          ok: false,
          error:
            e instanceof Error
              ? e.message
              : String(e),
        };
      } finally {
        active = false;
      }
    },
  };
}