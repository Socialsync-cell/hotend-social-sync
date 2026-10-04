export function seed(store) {
  if (store.get('seeded')) return;
  const examples = [
    ['instagram', 'post', 'maker.example', 'A little weekend project, a lot of colour. Printed this planter layer by layer.', 'planter', 'published'],
    ['facebook', 'comment', 'Sample customer', 'Really happy with how smoothly this printed. The colour is even better in person!', '', 'published'],
    ['instagram', 'post', 'prints.example', 'Fresh off the build plate. My new favourite desk companion.', 'vase', 'pending'],
    ['instagram', 'comment', 'studio.example', 'That finish looks amazing. Which material did you use?', '', 'pending'],
    ['facebook', 'post', 'Example maker', 'My first functional print! A small organiser that makes a big difference.', 'organiser', 'published'],
    ['instagram', 'comment', 'sample.account', 'A sample comment you have chosen to hide.', '', 'hidden'],
  ];
  examples.forEach(([platform, kind, author, text, image, status], i) => {
    const id = `demo-${i}`;
    store.upsert({ id, remote_id: String(i), platform, kind, author, text, image: image ? `/assets/demo-${image}.svg` : '', url: `https://www.${platform}.com/`, created: new Date(Date.now() - i * 3600_000).toISOString(), demo: true });
    store.db.prepare('UPDATE posts SET status=? WHERE id=?').run(status, id);
  });
  store.set('seeded', true);
}
