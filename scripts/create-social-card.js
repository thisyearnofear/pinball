#!/usr/bin/env node

/**
 * Create a social card for Farcaster using existing assets
 * This creates a 3:2 aspect ratio image for social sharing
 */

const { writeFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');

function createSocialCardHTML() {
  console.log('🎨 Creating social card...');
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 0;
            width: 600px;
            height: 400px;
            background: linear-gradient(135deg, #1b1922 0%, #2a2530 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Arial', sans-serif;
            position: relative;
            overflow: hidden;
        }
        .title-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 2;
        }
        .title-text {
            color: #00ff88;
            font-size: 48px;
            font-weight: bold;
            text-shadow: 0 0 20px #00ff88;
            margin-bottom: 10px;
            text-align: center;
        }
        .subtitle {
            color: #ffffff;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .cta {
            color: #ff9500;
            font-size: 32px;
            font-weight: bold;
            text-shadow: 0 0 15px #ff9500;
        }
        .logo {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 80px;
            height: 80px;
            background: #00ff88;
            border-radius: 50%;
            opacity: 0.3;
        }
        .glow {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 400px;
            height: 200px;
            background: radial-gradient(ellipse, rgba(0, 255, 136, 0.1), transparent);
            z-index: 1;
        }
    </style>
</head>
<body>
    <div class="glow"></div>
    <div class="logo"></div>
    <div class="title-container">
        <div class="title-text">ARBIPINBALL</div>
        <div class="subtitle">Tournament Pinball on Arbitrum</div>
        <div class="cta">Play Pinball!</div>
    </div>
</body>
</html>
  `;
  
  // Save HTML template for potential screenshot conversion
  const templatePath = join(process.cwd(), 'scripts', 'social-card-template.html');
  writeFileSync(templatePath, htmlContent);
  
  console.log('✅ Social card HTML template created');
  console.log('📍 Location:', templatePath);
  
  return true;
}

function createFallbackInstructions() {
  console.log('\n📋 MANUAL SOCIAL CARD CREATION:');
  console.log('');
  console.log('Since we cannot automatically create images, please:');
  console.log('');
  console.log('1. CREATE 600x400px IMAGE with:');
  console.log('   - Background: Dark gradient (#1b1922 to #2a2530)');
  console.log('   - Title: "ARBIPINBALL" in bright green (#00ff88)');
  console.log('   - Subtitle: "Tournament Pinball on Arbitrum"');
  console.log('   - CTA: "Play Pinball!" in orange (#ff9500)');
  console.log('');
  console.log('2. OR use existing title images:');
  console.log('   - Composite title_upper.png + title_lower.png');
  console.log('   - Add dark background');
  console.log('   - Resize to 600x400px');
  console.log('');
  console.log('3. SAVE AS: public/assets/social-card.png');
  console.log('');
  console.log('4. UPDATE REFERENCES (see below)');
  
  return templatePath;
}

function updateImageReferences() {
  console.log('\n🔧 Image Reference Summary:');
  console.log('');
  
  const currentSetup = {
    'Current logo.png (512x512)': {
      suitable_for: ['iconUrl', 'splashImageUrl'],
      farcaster_requirement: 'Square format ✅'
    },
    'Needed: social-card.png (600x400)': {
      suitable_for: ['imageUrl'],
      farcaster_requirement: '3:2 aspect ratio ⚠️'
    }
  };
  
  console.log('📊 CURRENT STATUS:');
  Object.entries(currentSetup).forEach(([image, info]) => {
    console.log(`   ${image}:`);
    console.log(`     - Use for: ${info.suitable_for.join(', ')}`);
    console.log(`     - Status: ${info.farcaster_requirement}`);
  });
  
  console.log('\n🎯 OPTIMAL CONFIGURATION:');
  console.log('   - imageUrl: "social-card.png" (for social sharing)');
  console.log('   - iconUrl: "logo.png" (current - perfect)');
  console.log('   - splashImageUrl: "logo.png" (current - perfect)');
  
  console.log('\n📝 FILES TO UPDATE:');
  console.log('   1. public/.well-known/farcaster.json');
  console.log('   2. index.html (fc:miniapp meta tag)');
  
  return true;
}

// Create the social card template
createSocialCardHTML();
createFallbackInstructions();
updateImageReferences();

console.log('\n🚀 NEXT STEPS:');
console.log('1. Create social-card.png (600x400px) manually');
console.log('2. Update image references in manifest');
console.log('3. Test with: npm run build');
console.log('4. Deploy and verify image URLs');

console.log(`\n💡 TIP: Open ${templatePath} in browser for reference`);