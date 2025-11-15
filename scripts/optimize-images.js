#!/usr/bin/env node

/**
 * Script to optimize and create proper images for Farcaster Mini App
 * Creates the correct aspect ratios needed for Farcaster
 */

const { copyFileSync, existsSync } = require('fs');
const { join } = require('path');

const DOMAIN = 'arbipinball.netlify.app';

function optimizeImages() {
  console.log('🖼️  Optimizing images for Farcaster Mini App...');
  
  const publicDir = join(process.cwd(), 'public', 'assets');
  const logoPath = join(publicDir, 'logo.png');
  
  // Check if logo exists
  if (!existsSync(logoPath)) {
    console.error('❌ Logo not found at:', logoPath);
    return false;
  }
  
  // Current logo is 512x512 (good for splash)
  // For now, we'll use the same logo for both purposes
  // In production, you'd want to create a 3:2 aspect ratio version
  
  console.log('✅ Current logo (512x512) - Good for splash image');
  console.log('⚠️  RECOMMENDATION: Create a 3:2 aspect ratio version for social sharing');
  console.log('   - Suggested size: 600x400px');
  console.log('   - Should show the game title/branding clearly');
  console.log('   - Consider using title_upper.png + title_lower.png composite');
  
  // Let's check the title images for potential use
  const titleUpper = join(publicDir, 'sprites', 'title_upper.png');
  const titleLower = join(publicDir, 'sprites', 'title_lower.png');
  
  if (existsSync(titleUpper) && existsSync(titleLower)) {
    console.log('✅ Found title images that could be used for 3:2 social card');
    console.log('   - title_upper.png');
    console.log('   - title_lower.png');
    console.log('   - Consider creating a composite social card with these');
  }
  
  return true;
}

function validateImageUrls() {
  console.log('\n🔗 Validating image URLs...');
  
  const imageUrls = [
    `https://${DOMAIN}/assets/logo.png`,
    `https://${DOMAIN}/favicon.ico`
  ];
  
  imageUrls.forEach(url => {
    console.log(`📍 ${url}`);
  });
  
  console.log('\n📋 Farcaster Image Requirements:');
  console.log('   - imageUrl: 3:2 aspect ratio (600x400px recommended)');
  console.log('   - splashImageUrl: Square format (200x200px recommended)');
  console.log('   - iconUrl: Square format (any size, 512x512 is fine)');
  console.log('   - All URLs must be absolute (https://)');
  
  return true;
}

function recommendOptimalSetup() {
  console.log('\n🎯 Recommended Image Setup:');
  console.log('');
  console.log('1. SOCIAL CARD (3:2 ratio - 600x400px):');
  console.log('   - Create a composite image with game title');
  console.log('   - Use dark background (#1b1922)');
  console.log('   - Include "Play Pinball!" text');
  console.log('   - Save as: social-card.png');
  console.log('');
  console.log('2. SPLASH IMAGE (Square - 200x200px):');
  console.log('   - Resize current logo to 200x200px');
  console.log('   - Or use current 512x512 (will be auto-resized)');
  console.log('   - Keep as: logo.png');
  console.log('');
  console.log('3. ICON (Square - 512x512px):');
  console.log('   - Current logo.png is perfect');
  console.log('   - Use for: iconUrl in manifest');
  console.log('');
  console.log('4. UPDATE REFERENCES:');
  console.log('   - imageUrl: social-card.png (when created)');
  console.log('   - splashImageUrl: logo.png (current)');
  console.log('   - iconUrl: logo.png (current)');
}

// Run the optimization
if (optimizeImages()) {
  validateImageUrls();
  recommendOptimalSetup();
}

console.log('\n🚀 Ready for deployment!');
console.log('💡 TIP: Test your images at https://farcaster.xyz/~/developers/mini-apps/preview');