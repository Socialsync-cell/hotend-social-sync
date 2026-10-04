@echo off
setlocal
cd /d "%~dp0"
echo Social Sync - publish the Social gallery block to Shopify
echo.
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto missing_node
where shopify >nul 2>nul
if errorlevel 1 (
  echo Installing the official Shopify CLI from npm...
  call npm install -g @shopify/cli@latest
  if errorlevel 1 goto failed
)
node scripts/prepare-theme-deploy.mjs
if errorlevel 1 goto failed
echo.
echo Sign in to your Shopify developer account if prompted.
call shopify app config validate --config gallery --json
if errorlevel 1 goto failed
call shopify app deploy --config gallery
if errorlevel 1 goto failed
echo.
echo Shopify CLI finished. Check above that an app version was released.
echo Allow a few minutes, then reopen the theme editor.
echo Choose Add section, Apps, Social gallery, then save your theme.
echo Keep shopify.app.gallery.toml and any generated extension UID for later releases.
pause
exit /b 0
:missing_node
echo Install Node.js 24 LTS from https://nodejs.org/en/download and run this file again.
pause
exit /b 1
:failed
echo.
echo Deployment did not complete. Read the error above before retrying.
echo Your existing Render server and its environment values were not changed.
pause
exit /b 1
