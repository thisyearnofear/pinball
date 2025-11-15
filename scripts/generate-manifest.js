#!/usr/bin/env node

/**
 * Script to generate a valid Farcaster manifest with account association
 * This creates the required /.well-known/farcaster.json file
 */

const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

// Configuration
const DOMAIN = 'arbipinball.netlify.app';
const APP_CONFIG = {
  name: 'ArbiPinball',
  iconUrl: `https://${DOMAIN}/assets/logo.png`,
  homeUrl: `https://${DOMAIN}`,
  imageUrl: `https://${DOMAIN}/assets/logo.png`,
  buttonTitle: 'Play Pinball!',
  splashImageUrl: `https://${DOMAIN}/assets/logo.png`,
  splashBackgroundColor: '#1b1922'
};

function generateManifest() {
  console.log('🎯 Generating Farcaster manifest...');
  
  // Create the manifest structure with proper account association format
  const manifest = {
    // This needs to be replaced with real signature data from Farcaster
    accountAssociation: {
      header: "eyJmaWQiOjEyMTUyLCJ0eXBlIjoiY3VzdG9keSIsImtleSI6IjB4MEJGNDVGOTY3RTkwZmZENjA2MzVkMUFDMTk1MDYyYTNBOUZjQzYyQiJ9",
      payload: btoa(JSON.stringify({ domain: DOMAIN })),
      signature: "REPLACE_WITH_YOUR_SIGNATURE"
    },
    frame: {
      version: "1",
      name: APP_CONFIG.name,
      iconUrl: APP_CONFIG.iconUrl,
      homeUrl: APP_CONFIG.homeUrl,
      imageUrl: APP_CONFIG.imageUrl,
      buttonTitle: APP_CONFIG.buttonTitle,
      splashImageUrl: APP_CONFIG.splashImageUrl,
      splashBackgroundColor: APP_CONFIG.splashBackgroundColor
    }
  };

  // Ensure directory exists
  const wellKnownDir = join(process.cwd(), 'public', '.well-known');
  mkdirSync(wellKnownDir, { recursive: true });

  // Write to public directory
  const outputPath = join(wellKnownDir, 'farcaster.json');
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  
  console.log('✅ Manifest created at:', outputPath);
  console.log('');
  console.log('🔧 IMPORTANT - You need to complete the account association:');
  console.log('');
  console.log('1. Go to: https://farcaster.xyz/~/developers/mini-apps');
  console.log('2. Create a new Mini App');
  console.log('3. Enter your domain: ' + DOMAIN);
  console.log('4. Download the generated manifest');
  console.log('5. Replace the accountAssociation section in your farcaster.json');
  console.log('');
  console.log('Or use the Farcaster CLI:');
  console.log('npm install -g @farcaster/cli');
  console.log(`farcaster app create --domain ${DOMAIN}`);
  console.log('');
  console.log(`📍 After deployment, verify at: https://${DOMAIN}/.well-known/farcaster.json`);
  
  return manifest;
}

// Generate the manifest
generateManifest();