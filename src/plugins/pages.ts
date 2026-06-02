import type { FastifyTypedInstance } from '@/types/index'
import fp from 'fastify-plugin'

const deleteAccountHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Delete Pump Account</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      body { background: #0b1020; color: #eef2ff; display: grid; min-height: 100vh; margin: 0; place-items: center; padding: 20px; box-sizing: border-box; }
      main { background: #151b2f; border: 1px solid #29314f; border-radius: 16px; box-sizing: border-box; max-width: 600px; padding: 32px; width: 100%; }
      h1 { font-size: 24px; margin-top: 0; color: #fff; }
      h2 { font-size: 18px; margin-top: 24px; color: #eef2ff; }
      p { color: #bdc7e6; line-height: 1.6; margin-bottom: 16px; }
      ol { color: #bdc7e6; line-height: 1.6; padding-left: 20px; }
      li { margin-bottom: 8px; }
      .warning { background: rgba(255, 180, 171, 0.1); border-left: 4px solid #ffb4ab; padding: 12px 16px; margin: 24px 0; border-radius: 4px; color: #ffb4ab; }
    </style>
  </head>
  <body>
    <main>
      <h1>Delete Your Pump Account</h1>

      <p>If you no longer wish to use Pump and want to permanently delete your account and all associated data, you can do so directly within the mobile app.</p>

      <h2>How to delete your account:</h2>
      <ol>
        <li>Open the <strong>Pump</strong> app on your device.</li>
        <li>Navigate to your <strong>Profile</strong> tab.</li>
        <li>Tap the <strong>Settings</strong> or <strong>Edit Profile</strong> option.</li>
        <li>Scroll to the bottom and tap <strong>Delete Account</strong>.</li>
        <li>Confirm your action in the prompt that appears.</li>
      </ol>

      <div class="warning">
        <strong>Warning:</strong> This action is irreversible. Deleting your account will permanently remove all your workout history, progress photos, personal details, and active subscriptions associated with your account.
      </div>

      <h2>Need Help?</h2>
      <p>If you have uninstalled the app or need assistance deleting your account, please contact our support team at <a href="mailto:thesaiteja.dev@gmail.com" style="color: #a9b7ff;">thesaiteja.dev@gmail.com</a> with your account email address.</p>
    </main>
  </body>
</html>`

export const pagesPlugin = fp(async (app: FastifyTypedInstance) => {
  app.get('/delete-account', async (_request, reply) => {
    return reply
      .header('Cache-Control', 'public, max-age=3600')
      .type('text/html')
      .send(deleteAccountHtml)
  })
})
