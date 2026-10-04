import { hmac, safeURL } from './security.js';

export class MetaError extends Error {
  constructor(data, status) {
    const code = data?.error?.code || status;

    super(
      code === 190
        ? 'Meta access expired. Reconnect your accounts.'
        : `Meta could not provide this content (code ${code}). Check account permissions in Meta.`,
    );

    this.code = code;
  }
}

export class Meta {
  constructor(config, transport = fetch) {
    this.config = config;
    this.transport = transport;
    this.calls = 0;
  }

  async request(path, params = {}, token = '') {
    if (++this.calls > 180) {
      throw new Error(
        'Sync request limit reached; remaining content will be retried in the next cycle.',
      );
    }

    if (!/^[a-zA-Z0-9_/-]+$/.test(path)) {
      throw new Error('Invalid Meta path');
    }

    const url = new URL(
      `https://graph.facebook.com/${this.config.metaVersion}/${path}`,
    );

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    if (token) {
      url.searchParams.set(
        'appsecret_proof',
        hmac(this.config.metaSecret, token),
      );
    }

    let response;

    try {
      response = await this.transport(url, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      throw new Error(
        'Meta connection timed out or is unavailable. Sync will retry.',
      );
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error('Meta returned an unreadable response.');
    }

    if (!response.ok || data.error) {
      throw new MetaError(data, response.status);
    }

    return data;
  }

  async list(path, params, token, maxPages = 3) {
    const result = [];
    let after;

    for (let page = 0; page < maxPages; page++) {
      const data = await this.request(
        path,
        {
          ...params,
          limit: 25,
          after,
        },
        token,
      );

      if (!Array.isArray(data.data)) {
        throw new Error(
          'Meta returned an unexpected content list.',
        );
      }

      result.push(...data.data);

      const cursor = data.paging?.cursors?.after;

      if (
        !data.paging?.next ||
        !cursor ||
        cursor === after
      ) {
        break;
      }

      after = cursor;
    }

    return result;
  }

  async authorize(code, redirect) {
    const c = this.config;

    const short = await this.request(
      'oauth/access_token',
      {
        client_id: c.metaId,
        client_secret: c.metaSecret,
        redirect_uri: redirect,
        code,
      },
    );

    if (!short.access_token) {
      throw new Error(
        'Meta did not return an access token.',
      );
    }

    const long = await this.request(
      'oauth/access_token',
      {
        grant_type: 'fb_exchange_token',
        client_id: c.metaId,
        client_secret: c.metaSecret,
        fb_exchange_token: short.access_token,
      },
    );

    if (!long.access_token) {
      throw new Error(
        'Meta did not return a long-lived access token.',
      );
    }

    const me = await this.request(
      'me',
      {
        fields: 'id',
      },
      long.access_token,
    );

    const pages = await this.list(
      'me/accounts',
      {
        fields:
          'id,name,access_token,instagram_business_account{id,username}',
      },
      long.access_token,
      10,
    );

    return {
      userId: me.id,
      pages: pages.filter((p) => p.access_token),
      expires: Date.now() + 600_000,
    };
  }
}

export const fields = {
  ig: [
    'id',
    'caption',
    'media_type',
    'media_url',
    'thumbnail_url',
    'permalink',
    'timestamp',
    'username',
  ].join(','),

  ic: [
    'id',
    'text',
    'username',
    'timestamp',
  ].join(','),

  fb: [
    'id',
    'message',
    'full_picture',
    'permalink_url',
    'created_time',
    'from',
  ].join(','),

  fc: [
    'id',
    'message',
    'created_time',
    'from',
    'attachment',
  ].join(','),
};

export function normalize(
  platform,
  kind,
  item,
  parentURL = '',
  fallbackAuthor = '',
) {
  const id = String(item.id || '');

  if (!/^[\d_]+$/.test(id)) {
    throw new Error(
      'Meta content has an invalid identifier',
    );
  }

  const instagram = platform === 'instagram';
  const comment = kind === 'comment';

  const created =
    item.timestamp ||
    item.created_time;

  const url = safeURL(
    item.permalink ||
      item.permalink_url ||
      parentURL,
  );

  let author;

  if (instagram) {
    author =
      item.username ||
      fallbackAuthor ||
      'Instagram user';
  } else {
    author =
      item.from?.name ||
      fallbackAuthor ||
      'Facebook user';
  }

  return {
    id: `${platform}:${kind}:${id}`,
    remote_id: id,
    platform,
    kind,

    author: String(author).slice(0, 120),

    text: String(
      instagram
        ? (
            comment
              ? item.text
              : item.caption
          ) || ''
        : item.message || '',
    ).slice(0, 5000),

    image: safeURL(
      instagram
        ? item.media_type === 'VIDEO'
          ? item.thumbnail_url
          : item.media_url
        : item.full_picture ||
            item.attachment?.media?.image?.src,
      true,
    ),

    url,

    created: Number.isFinite(
      Date.parse(created),
    )
      ? new Date(created).toISOString()
      : new Date().toISOString(),
  };
}

export async function collect(
  meta,
  connection,
  existing = [],
) {
  const posts = new Map();
  const missing = [];
  const errors = [];

  const token = connection.token;
  let tokenExpired = false;

  const add = (post) => {
    if (!post?.id) {
      return;
    }

    if (!posts.has(post.id)) {
      posts.set(post.id, post);
    }
  };

  const attempt = async (name, task) => {
    if (tokenExpired) {
      return;
    }

    try {
      await task();
    } catch (error) {
      if (
        error instanceof MetaError &&
        error.code === 190
      ) {
        tokenExpired = true;
        errors.push(
          'Meta access expired. Reconnect your accounts.',
        );
        return;
      }

      errors.push(
        `${name}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  };

  /*
   * FACEBOOK POSTS + COMMENTS
   */
  if (connection.pageId) {
    await attempt(
      'Facebook feed',
      async () => {
        const feed = await meta.list(
          `${connection.pageId}/feed`,
          {
            fields: fields.fb,
          },
          token,
          3,
        );

        for (const post of feed) {
          const isPagePost =
            post.from?.id === connection.pageId;

          if (!isPagePost) {
            add(
              normalize(
                'facebook',
                'post',
                post,
                post.permalink_url ||
                  `https://www.facebook.com/${post.id}`,
              ),
            );
          }

          await attempt(
            `Facebook comments ${post.id}`,
            async () => {
              const comments =
                await meta.list(
                  `${post.id}/comments`,
                  {
                    fields: fields.fc,
                  },
                  token,
                  1,
                );

              for (const comment of comments) {
                if (
                  comment.from?.id ===
                  connection.pageId
                ) {
                  continue;
                }

                add(
                  normalize(
                    'facebook',
                    'comment',
                    comment,
                    post.permalink_url ||
                      `https://www.facebook.com/${post.id}`,
                  ),
                );
              }
            },
          );
        }
      },
    );
  }

  /*
   * INSTAGRAM TAGGED POSTS
   */
  if (connection.igId) {
    await attempt(
      'Instagram tagged posts',
      async () => {
        const tagged = await meta.list(
          `${connection.igId}/tags`,
          {
            fields: fields.ig,
          },
          token,
          1,
        );

        for (const media of tagged) {
          if (
            String(media.username || '')
              .toLowerCase() ===
            String(connection.igName || '')
              .toLowerCase()
          ) {
            continue;
          }

          add(
            normalize(
              'instagram',
              'post',
              media,
              media.permalink,
            ),
          );
        }
      },
    );

    /*
     * INSTAGRAM OWN POSTS + COMMENTS
     */
    await attempt(
      'Instagram media',
      async () => {
        const media = await meta.list(
          `${connection.igId}/media`,
          {
            fields: fields.ig,
          },
          token,
          3,
        );

        for (const post of media) {
          await attempt(
            `Instagram comments ${post.id}`,
            async () => {
              const comments =
                await meta.list(
                  `${post.id}/comments`,
                  {
                    fields: fields.ic,
                  },
                  token,
                  1,
                );

              for (const comment of comments) {
                if (
                  String(comment.username || '')
                    .toLowerCase() ===
                  String(connection.igName || '')
                    .toLowerCase()
                ) {
                  continue;
                }

                add(
                  normalize(
                    'instagram',
                    'comment',
                    comment,
                    post.permalink,
                  ),
                );
              }
            },
          );
        }
      },
    );
  }

  /*
   * REFRESH CONTENT ALREADY STORED
   */
  for (const post of existing) {
    if (tokenExpired) {
      break;
    }

    if (posts.has(post.id)) {
      continue;
    }

    try {
      const selectedFields =
        post.platform === 'instagram'
          ? post.kind === 'comment'
            ? fields.ic
            : fields.ig
          : post.kind === 'comment'
            ? fields.fc
            : fields.fb;

      const item = await meta.request(
        post.remote_id,
        {
          fields: selectedFields,
        },
        token,
      );

      let fallbackAuthor = '';

      if (
        post.platform === 'facebook' &&
        post.author === connection.pageName
      ) {
        fallbackAuthor =
          connection.pageName;
      }

      if (
        post.platform === 'instagram' &&
        post.kind === 'post'
      ) {
        fallbackAuthor =
          connection.igName;
      }

      const ownFacebook =
        post.platform === 'facebook' &&
        item.from?.id === connection.pageId;

      const ownInstagram =
        post.platform === 'instagram' &&
        String(item.username || '')
          .toLowerCase() ===
        String(connection.igName || '')
          .toLowerCase();

      if (ownFacebook || ownInstagram) {
        missing.push(post.id);
        continue;
      }

      add(
        normalize(
          post.platform,
          post.kind,
          item,
          post.url,
          fallbackAuthor,
        ),
      );
    } catch (error) {
      if (
        error instanceof MetaError &&
        error.code === 100
      ) {
        missing.push(post.id);
      } else {
        errors.push(
          `Content refresh: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }
  }

  return {
    posts: [...posts.values()],
    missing,
    errors: [...new Set(errors)],
  };
}