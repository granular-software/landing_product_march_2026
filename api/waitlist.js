export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, github = '', twitter = '', page = 'unknown' } = req.body || {};

  if (!email || (!github && !twitter)) {
    return res.status(400).json({ error: 'Email and one profile are required' });
  }

  const webhookUrl = process.env.SLACK_WAITLIST_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(500).json({ error: 'Missing SLACK_WAITLIST_WEBHOOK_URL' });
  }

  const text = [
    'New Granular waitlist signup',
    `Email: ${email}`,
    `GitHub: ${github || 'N/A'}`,
    `Twitter: ${twitter || 'N/A'}`,
    `Page: ${page}`,
  ].join('\n');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}`);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send Slack notification' });
  }
}
