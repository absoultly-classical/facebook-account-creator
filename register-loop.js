const puppeteer = require('puppeteer');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');
const { execFileSync } = require('child_process');

// ==================== KONFIGURASI ====================
const CONFIG = {
  emailDomains: (process.env.EMAIL_DOMAINS || 'example.invalid')
    .split(',').map((domain) => domain.trim().replace(/^@/, '')).filter(Boolean),
  emailApiKey: process.env.EMAIL_API_KEY || '',
  emailApiBase: process.env.EMAIL_API_BASE || '',
  password: process.env.ACCOUNT_PASSWORD || '',
  headless: process.env.HEADLESS !== 'false',
  slowMo: 50,
  probeOnly: process.env.PROBE_ONLY !== 'false',
  useGoogleSheets: process.env.USE_GOOGLE_SHEETS === 'true',
  requireIndonesia: process.env.REQUIRE_INDONESIA === 'true',
  maxRegistrations: Number(process.env.MAX_REGISTRATIONS || 1),
  executablePath: process.env.CHROME_PATH || undefined,
  uploadProfilePhoto: process.env.UPLOAD_PROFILE_PHOTO === 'true',
  resultsPath: process.env.RESULTS_PATH || path.join(__dirname, 'results.jsonl'),
  vmail: {
    local: process.env.VMAIL_LOCAL === 'true',
    sshHost: process.env.VMAIL_SSH_HOST || '',
    helperPath: process.env.VMAIL_HELPER_PATH || '',
    pythonPath: process.env.VMAIL_PYTHON_PATH || 'python',
    domain: process.env.VMAIL_DOMAIN || '',
    otpTimeout: Number(process.env.VMAIL_OTP_TIMEOUT || 180),
  },
  // Google Sheets
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  sheetName: process.env.GOOGLE_SHEET_NAME || 'Sheet1',
  serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '',
  // Loop settings
  delayBetweenRegistrations: 10000, // 10 detik antara registrasi
  // Folder foto profil
  photosFolder: path.join(__dirname, 'photos'),
  // Proxy settings (DataImpulse)
  proxy: {
    host: process.env.PROXY_HOST || '',
    port: Number(process.env.PROXY_PORT || 823),
    username: process.env.PROXY_USERNAME || '',
    password: process.env.PROXY_PASSWORD || '',
  },
};

// ==================== GOOGLE SHEETS ====================
let sheets = null;
let auth = null;

async function initGoogleSheets() {
  try {
    if (!CONFIG.spreadsheetId || !CONFIG.serviceAccountPath) {
      throw new Error('Set GOOGLE_SPREADSHEET_ID and GOOGLE_SERVICE_ACCOUNT_FILE');
    }
    const credentials = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, 'utf-8'));

    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheets = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets API initialized');
    return true;
  } catch (err) {
    console.error('❌ Error initializing Google Sheets:', err.message);
    return false;
  }
}

async function getNextRowNumber() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!A:A`,
    });

    const rows = response.data.values || [];
    return rows.length + 1; // Next empty row (1-indexed)
  } catch (err) {
    console.error('❌ Error getting row count:', err.message);
    return 2; // Default to row 2 if error
  }
}

async function appendToSheet(data) {
  try {
    // Format tanggal registrasi
    const now = new Date();
    const regisDate = now.toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const values = [[
      data.uid || '',        // A: UID (Facebook User ID / c_user)
      data.firstName,        // B: First Name
      data.lastName,         // C: Last Name
      data.email,            // D: Email
      data.password,         // E: Password
      data.cookieString,     // F: Cookie
      '',                    // G: Pick (kosong, diisi manual)
      regisDate,             // H: Regis Date
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.spreadsheetId,
      range: `${CONFIG.sheetName}!A:H`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: { values },
    });

    console.log(`✅ Data disimpan ke Google Sheets`);
    return true;
  } catch (err) {
    console.error('❌ Error appending to sheet:', err.message);
    return false;
  }
}

// ==================== HELPERS ====================
function loadUserAgents(filename = 'UA.txt') {
  const uaFile = path.join(__dirname, filename);
  if (fs.existsSync(uaFile)) {
    const content = fs.readFileSync(uaFile, 'utf-8');
    return content.split('\n')
      .map(line => line.trim().replace(/\r/g, ''))
      .filter(line => line !== '' && line.startsWith('Mozilla'));
  }
  return ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'];
}

const USER_AGENTS = loadUserAgents('UA.txt');
const USER_AGENTS_MOBILE = loadUserAgents('UAMobile.txt');

function generateUserData() {
  if (!CONFIG.password) throw new Error('Set ACCOUNT_PASSWORD in the environment');
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  // Generate email seperti orang asli (firstname + lastname + angka)
  // Contoh: johnsmith123, maryjane45, davidlee789
  const emailPatterns = [
    () => `${firstName.toLowerCase()}${lastName.toLowerCase()}${faker.number.int({ min: 1, max: 99 })}`,
    () => `${firstName.toLowerCase()}.${lastName.toLowerCase()}${faker.number.int({ min: 1, max: 99 })}`,
    () => `${firstName.toLowerCase()}${faker.number.int({ min: 10, max: 999 })}`,
    () => `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    () => `${firstName.toLowerCase()}${lastName.toLowerCase().substring(0, 3)}${faker.number.int({ min: 1, max: 99 })}`,
    () => `${firstName.toLowerCase().substring(0, 1)}${lastName.toLowerCase()}${faker.number.int({ min: 10, max: 999 })}`,
  ];

  let emailName = faker.helpers.arrayElement(emailPatterns)();
  emailName = emailName.replace(/[^a-z0-9._]/g, '').substring(0, 15);

  // Random email domain
  const emailDomain = CONFIG.emailDomains[Math.floor(Math.random() * CONFIG.emailDomains.length)];

  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - faker.number.int({ min: 20, max: 45 });
  const birthMonth = faker.number.int({ min: 1, max: 12 });
  const birthDay = faker.number.int({ min: 1, max: 28 });

  const gender = faker.helpers.arrayElement(['1', '2']);

  return {
    firstName,
    lastName,
    email: `${emailName}@${emailDomain}`,
    emailDomain,
    password: CONFIG.password,
    birthDay: birthDay.toString(),
    birthMonth: birthMonth.toString(),
    birthYear: birthYear.toString(),
    gender,
  };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Cek IP via proxy - return { ip, country, cc, isIndonesia }
async function checkIP(page) {
  try {
    await page.goto('https://api.myip.com/', { waitUntil: 'networkidle2', timeout: 15000 });
    const content = await page.evaluate(() => document.body.innerText);
    const ipData = JSON.parse(content);

    // {"ip":"115.84.103.19","country":"Indonesia","cc":"ID"}
    const isIndonesia = ipData.cc === 'ID' || ipData.country === 'Indonesia';

    if (isIndonesia) {
      console.log(`🌍 IP: ${ipData.ip} | ${ipData.country} (${ipData.cc}) ✅`);
    } else {
      console.log(`🌍 IP: ${ipData.ip} | ${ipData.country} (${ipData.cc}) ⚠️ BUKAN INDONESIA`);
    }

    return { ...ipData, isIndonesia };
  } catch (err) {
    console.log(`⚠️ Gagal cek IP: ${err.message}`);
    return { isIndonesia: false };
  }
}

// Get random photo from photos folder
function getRandomPhoto() {
  try {
    if (!fs.existsSync(CONFIG.photosFolder)) {
      return null;
    }
    const files = fs.readdirSync(CONFIG.photosFolder)
      .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f));
    if (files.length === 0) {
      return null;
    }
    const randomFile = files[Math.floor(Math.random() * files.length)];
    return path.join(CONFIG.photosFolder, randomFile);
  } catch (err) {
    return null;
  }
}

// Upload profile photo
async function uploadProfilePhoto(page, photoPath) {
  try {
    console.log('📷 Mengupload foto profil...');

    // Buka halaman profil
    await page.goto('https://www.facebook.com/me', { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(2000);

    // Klik foto profil untuk update
    const profilePhotoSelectors = [
      'svg[aria-label="Update profile picture"]',
      'div[aria-label="Update profile picture"]',
      'image[style*="profile"]',
      'a[href*="profile_picture"]',
    ];

    let clicked = false;
    for (const selector of profilePhotoSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        await page.click(selector);
        clicked = true;
        break;
      } catch (e) {}
    }

    if (!clicked) {
      // Coba klik langsung pada foto profil area
      await page.evaluate(() => {
        const imgs = document.querySelectorAll('image, img');
        for (const img of imgs) {
          if (img.closest('a[href*="photo"]') || img.closest('[role="button"]')) {
            img.click();
            return true;
          }
        }
        return false;
      });
    }

    await delay(2000);

    // Cari tombol upload
    const uploadButton = await page.$('input[type="file"]');
    if (uploadButton) {
      await uploadButton.uploadFile(photoPath);
      console.log('   ✓ Foto diupload');

      await delay(3000);

      // Klik Save/Simpan
      const saveSelectors = [
        'div[aria-label="Save"]',
        'div[aria-label="Simpan"]',
        'button[type="submit"]',
        'span:has-text("Save")',
        'span:has-text("Simpan")',
      ];

      for (const selector of saveSelectors) {
        try {
          await page.click(selector);
          break;
        } catch (e) {}
      }

      await delay(3000);
      console.log('   ✅ Foto profil berhasil diupdate!');
      return true;
    } else {
      console.log('   ⚠️ Input file tidak ditemukan');
      return false;
    }
  } catch (err) {
    console.log(`   ⚠️ Gagal upload foto: ${err.message}`);
    return false;
  }
}

function runVmailHelper(args, timeoutMs = 30000) {
  const command = CONFIG.vmail.local ? CONFIG.vmail.pythonPath : 'ssh';
  const commandArgs = CONFIG.vmail.local
    ? [CONFIG.vmail.helperPath, ...args]
    : [CONFIG.vmail.sshHost, CONFIG.vmail.pythonPath, CONFIG.vmail.helperPath, ...args];
  const output = execFileSync(command, commandArgs, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  const jsonLine = output.trim().split(/\r?\n/).reverse().find((line) => line.trim().startsWith('{'));
  if (!jsonLine) throw new Error(`vmail helper tidak mengembalikan JSON: ${output.slice(-300)}`);
  return JSON.parse(jsonLine);
}

function createVmailMailbox() {
  return runVmailHelper(['create', '--domain', CONFIG.vmail.domain]);
}

async function fetchVerificationCode(userData, maxRetries = 10, retryDelay = 5000) {
  const email = userData.email;
  if ((CONFIG.vmail.local || CONFIG.vmail.sshHost) && userData.mailboxId) {
    console.log(`\n📧 Menunggu kode vmail untuk: ${email}`);
    const result = runVmailHelper([
      'poll',
      '--domain', CONFIG.vmail.domain,
      '--email', email,
      `--mailbox-id=${userData.mailboxId}`,
      '--issued-after', String(userData.otpIssuedAfter || (Date.now() / 1000 - 30)),
      '--timeout', String(CONFIG.vmail.otpTimeout),
    ], (CONFIG.vmail.otpTimeout + 30) * 1000);
    return result.code || null;
  }

  if (!CONFIG.emailApiBase || !CONFIG.emailApiKey) {
    throw new Error('Set EMAIL_API_BASE and EMAIL_API_KEY, or configure the vmail helper');
  }

  const apiUrl = `${CONFIG.emailApiBase.replace(/\/$/, '')}/${email}/${CONFIG.emailApiKey}`;

  // Random mobile UA untuk request API
  const mobileUA = USER_AGENTS_MOBILE[Math.floor(Math.random() * USER_AGENTS_MOBILE.length)];

  console.log(`\n📧 Menunggu kode verifikasi untuk: ${email}`);

  for (let i = 1; i <= maxRetries; i++) {
    console.log(`   Percobaan ${i}/${maxRetries}...`);

    try {
      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': mobileUA
        }
      });
      const messages = response.data;

      if (Array.isArray(messages) && messages.length > 0) {
        for (const msg of messages) {
          if (msg.sender_email && msg.sender_email.includes('facebook')) {
            const subjectMatch = msg.subject.match(/FB-(\d+)/);
            if (subjectMatch) {
              console.log(`   ✅ Kode ditemukan: FB-${subjectMatch[1]}`);
              return subjectMatch[1];
            }

            const contentMatch = msg.content.match(/FB-(\d+)/);
            if (contentMatch) {
              console.log(`   ✅ Kode ditemukan: FB-${contentMatch[1]}`);
              return contentMatch[1];
            }
          }
        }
      }
    } catch (err) {
      console.log(`   ⚠️ Error: ${err.message}`);
    }

    if (i < maxRetries) await delay(retryDelay);
  }

  return null;
}

// ==================== MAIN REGISTRATION ====================
async function registerFacebook() {
  const userData = generateUserData();
  if (CONFIG.vmail.local || CONFIG.vmail.sshHost) {
    const mailbox = createVmailMailbox();
    userData.email = mailbox.email;
    userData.mailboxId = mailbox.mailboxId;
  }
  let cookieString = '';
  let success = false;
  let uid = '';

  console.log('\n' + '='.repeat(60));
  console.log('📋 Data registrasi:');
  console.log(`   Nama: ${userData.firstName} ${userData.lastName}`);
  console.log(`   Email: ${userData.email}`);
  console.log(`   Password: ${userData.password}`);
  console.log('='.repeat(60));

  // Generate random session ID untuk rotating proxy
  const sessionId = Math.random().toString(36).substring(2, 15);

  console.log(`🌐 Proxy session: ${sessionId}`);

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--renderer-process-limit=2',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=1366,768',
  ];
  if (CONFIG.proxy.host) {
    launchArgs.push(`--proxy-server=${CONFIG.proxy.host}:${CONFIG.proxy.port}`);
  }

  const browser = await puppeteer.launch({
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
    executablePath: CONFIG.executablePath,
    args: launchArgs,
    defaultViewport: { width: 1366, height: 768 },
  });

  const page = await browser.newPage();

  // Authenticate proxy - DataImpulse format
  if (CONFIG.proxy.host && CONFIG.proxy.username) {
    await page.authenticate({
      username: CONFIG.proxy.username,
      password: CONFIG.proxy.password,
    });
  }

  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(randomUA);
  console.log(`🖥️ UA: ${randomUA.substring(0, 50)}...`);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  try {
    // Cek IP dulu sebelum mulai
    const ipInfo = await checkIP(page);

    // Skip jika bukan Indonesia
    if (CONFIG.requireIndonesia && !ipInfo.isIndonesia) {
      console.log('⏭️ SKIP - IP bukan Indonesia, tutup browser dan coba lagi...');
      await browser.close();
      return { success: false, skipped: true };
    }

    console.log('🌐 Membuka Facebook...');
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 60000 });

    // Klik tombol registrasi
    console.log('🔍 Mencari tombol registrasi...');
    try {
      const registrationSelector = await Promise.race([
        page.waitForSelector('a[data-testid="open-registration-form-button"]', { timeout: 5000 })
          .then(() => 'a[data-testid="open-registration-form-button"]'),
        page.waitForSelector('a[href^="/reg/"]', { timeout: 5000 })
          .then(() => 'a[href^="/reg/"]'),
      ]);
      await page.click(registrationSelector);
      console.log('✅ Klik tombol registrasi');
    } catch (e) {
      throw new Error('Tombol registrasi tidak ditemukan');
    }

    await delay(3000);
    console.log('📝 Mengisi form...');

    const legacyForm = await page.$('input[name="firstname"]');
    if (legacyForm) {
      await page.type('input[name="firstname"]', userData.firstName, { delay: 50 });
      await page.type('input[name="lastname"]', userData.lastName, { delay: 50 });
      await page.type('input[name="reg_email__"]', userData.email, { delay: 30 });

      await delay(1500);
      const confirmField = await page.$('input[name="reg_email_confirmation__"]');
      if (confirmField) await confirmField.type(userData.email, { delay: 30 });

      await page.type('input[name="reg_passwd__"]', userData.password, { delay: 30 });
      await page.select('select[name="birthday_day"]', userData.birthDay);
      await page.select('select[name="birthday_month"]', userData.birthMonth);
      await page.select('select[name="birthday_year"]', userData.birthYear);

      const genderSelector = `input[name="sex"][value="${userData.gender}"]`;
      await page.evaluate((selector) => document.querySelector(selector)?.click(), genderSelector);
      await delay(1000);
      userData.otpIssuedAfter = Date.now() / 1000 - 5;
      await page.click('button[name="websubmit"]');
    } else {
      // Current Meta-account registration form (2026): unnamed React inputs and ARIA comboboxes.
      await page.waitForSelector('input', { timeout: 10000 });
      const fields = await page.$$('input');
      if (fields.length < 4) throw new Error(`Form Meta baru tidak lengkap: ${fields.length} input`);

      await fields[0].type(userData.lastName, { delay: 50 });
      await fields[1].type(userData.firstName, { delay: 50 });
      await fields[2].type(userData.email, { delay: 30 });
      await fields[3].type(userData.password, { delay: 30 });

      const comboboxes = await page.$$('[role="combobox"]');
      if (comboboxes.length < 4) throw new Error(`Form Meta baru tidak lengkap: ${comboboxes.length} combobox`);

      const comboLabels = await Promise.all(comboboxes.map((combobox) =>
        combobox.evaluate((element) => element.getAttribute('aria-label') || '')));
      const findCombo = (pattern, fallbackIndex) => {
        const index = comboLabels.findIndex((label) => pattern.test(label));
        return comboboxes[index >= 0 ? index : fallbackIndex];
      };
      const monthCombo = findCombo(/month|bulan|月/i, 1);
      const dayCombo = findCombo(/day|hari|日/i, 2);
      const yearCombo = findCombo(/year|tahun|年/i, 0);
      const datedCombos = new Set([monthCombo, dayCombo, yearCombo]);
      const genderCombo = comboboxes.find((combobox) => !datedCombos.has(combobox)) || comboboxes[3];

      const chooseVisibleOption = async (combobox, labels) => {
        await combobox.click();
        await delay(300);
        const chosen = await page.evaluate((candidateLabels) => {
          const visibleOptions = Array.from(document.querySelectorAll('[role="option"]'))
            .filter((option) => {
              const rect = option.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
          const option = visibleOptions.find((item) => candidateLabels.includes(item.textContent.trim()));
          if (!option) return null;
          option.click();
          return option.textContent.trim();
        }, labels);
        if (!chosen) throw new Error(`Opsi tidak ditemukan: ${labels.join('/')}`);
      };

      const monthNumber = Number(userData.birthMonth);
      const monthDate = new Date(2000, monthNumber - 1, 1);
      const monthLabels = [
        userData.birthMonth,
        `${monthNumber} 月`,
        new Intl.DateTimeFormat('en-US', { month: 'long' }).format(monthDate),
        new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monthDate),
      ];
      await chooseVisibleOption(monthCombo, monthLabels);
      await chooseVisibleOption(dayCombo, [userData.birthDay]);
      await chooseVisibleOption(yearCombo, [userData.birthYear]);
      await chooseVisibleOption(genderCombo, userData.gender === '1' ? ['女', 'Female', 'Perempuan'] : ['男', 'Male', 'Laki-laki']);

      await delay(1000);
      userData.otpIssuedAfter = Date.now() / 1000 - 5;
      const submitted = await page.evaluate(() => {
        const labels = ['提交', 'Sign Up', 'Submit'];
        const button = Array.from(document.querySelectorAll('[role="button"], button'))
          .find((element) => labels.includes(element.textContent.trim()));
        if (!button) return false;
        button.click();
        return true;
      });
      if (!submitted) throw new Error('Tombol submit form Meta baru tidak ditemukan');
    }

    console.log('✅ Form terisi');
    console.log('🚀 Form submitted!');

    // Tunggu navigasi
    console.log('⏳ Menunggu halaman verifikasi...');
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    } catch (e) {}

    await delay(3000);

    let currentUrl = page.url();
    let pageContent = await page.content();

    const probe = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 12000),
      inputs: Array.from(document.querySelectorAll('input')).map((input) => ({
        name: input.name,
        type: input.type,
        placeholder: input.placeholder,
        autocomplete: input.autocomplete,
      })),
    }));
    const phonePattern = /phone number|mobile number|text message|send sms|sms code|手机号码|手机号|电话号码|短信/i;
    const emailPattern = /email|code from your email|confirmation code|邮箱|电子邮件|邮件验证码/i;
    const probeResult = {
      timestamp: new Date().toISOString(),
      url: probe.url,
      title: probe.title,
      asksForPhone: phonePattern.test(probe.text),
      asksForEmailCode: emailPattern.test(probe.text) || currentUrl.includes('confirmemail'),
      inputs: probe.inputs,
      visibleText: probe.text,
    };
    fs.writeFileSync(path.join(__dirname, 'probe-result.json'), JSON.stringify(probeResult, null, 2));
    fs.writeFileSync(path.join(__dirname, 'probe-page.html'), pageContent);
    await page.screenshot({ path: path.join(__dirname, 'probe-page.png'), fullPage: true });
    console.log('PROBE_RESULT=' + JSON.stringify({
      url: probeResult.url,
      asksForPhone: probeResult.asksForPhone,
      asksForEmailCode: probeResult.asksForEmailCode,
      inputs: probeResult.inputs,
    }));

    if (CONFIG.probeOnly) {
      return {
        success: false,
        verificationType: probeResult.asksForPhone ? 'phone' : (probeResult.asksForEmailCode ? 'email' : 'unknown'),
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password,
        cookieString: '',
      };
    }

    // Cek error registrasi (termasuk element reg_error_inner)
    const hasRegistrationError = pageContent.includes('reg_error_inner') ||
                                  pageContent.includes('There was an error with your registration') ||
                                  pageContent.includes('error with your registration') ||
                                  pageContent.includes('Please try registering again') ||
                                  pageContent.includes('_58mo');

    // Cek juga via selector
    const errorElement = await page.$('#reg_error_inner');

    if (hasRegistrationError || errorElement) {
      console.log('❌ Facebook menolak registrasi: "There was an error with your registration"');
      throw new Error('Registration rejected by Facebook');
    }

    // Cek verifikasi email
    const needsVerification = probeResult.asksForEmailCode ||
                              pageContent.includes('Enter the code') ||
                              pageContent.includes('confirmation code') ||
                              pageContent.includes('code from your email') ||
                              currentUrl.includes('confirmemail');

    if (needsVerification) {
      console.log('📧 Verifikasi email diperlukan!');

      const verificationCode = await fetchVerificationCode(userData);

      if (verificationCode) {
        console.log(`🔑 Memasukkan kode: ${verificationCode}`);

        // Input kode
        const codeInput = await page.$('input[name="code"], input[autocomplete="one-time-code"], input[type="text"]');
        if (codeInput) {
          await codeInput.click({ clickCount: 3 });
          await codeInput.type(verificationCode, { delay: 50 });

          await delay(1000);
          const continued = await page.evaluate(() => {
            const labels = ['继续', 'Continue', '提交', 'Submit'];
            const button = Array.from(document.querySelectorAll('[role="button"], button'))
              .find((element) => labels.includes(element.textContent.trim()));
            if (!button) return false;
            button.click();
            return true;
          });
          if (!continued) throw new Error('Tombol lanjut verifikasi tidak ditemukan');

          await delay(5000);

          currentUrl = page.url();
          pageContent = await page.content();

          // Cek apakah masuk ke checkpoint (gagal)
          if (currentUrl.includes('/checkpoint')) {
            console.log('❌ Masuk ke checkpoint setelah OTP - GAGAL');
            throw new Error('Checkpoint detected after OTP verification');
          }

          if (pageContent.includes('Account confirmed') || pageContent.includes('successfully confirmed')) {
            console.log('🎉 REGISTRASI BERHASIL!');
            success = true;
          }
        }
      }
    }

    // Get cookies
    const cookies = await page.cookies();
    cookieString = cookies.map(c => `${c.name}=${c.value}`).join(';');

    // Cek apakah ada c_user (login berhasil)
    const c_user = cookies.find(c => c.name === 'c_user');
    if (c_user) {
      success = true;
      uid = c_user.value;
      console.log(`✅ Login berhasil! UID: ${uid}`);

      // Upload foto profil jika ada
      const photoPath = getRandomPhoto();
      if (CONFIG.uploadProfilePhoto && photoPath) {
        await uploadProfilePhoto(page, photoPath);
      } else {
        console.log('📷 Tidak ada foto di folder photos/, skip upload foto');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      const failure = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        text: (document.body?.innerText || '').slice(0, 12000),
      }));
      fs.writeFileSync(path.join(__dirname, 'probe-failure.json'), JSON.stringify({
        timestamp: new Date().toISOString(),
        error: error.message,
        ...failure,
      }, null, 2));
      fs.writeFileSync(path.join(__dirname, 'probe-failure.html'), await page.content());
      await page.screenshot({ path: path.join(__dirname, 'probe-failure.png'), fullPage: true });
      console.log('PROBE_FAILURE=' + JSON.stringify(failure));
    } catch (captureError) {
      console.error('❌ Failed to capture probe evidence:', captureError.message);
    }
  } finally {
    await browser.close();
    console.log('🔒 Browser ditutup');
  }

  return {
    success,
    uid,
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    password: userData.password,
    cookieString,
    mailboxId: userData.mailboxId || '',
  };
}

// ==================== MAIN LOOP ====================
async function main() {
  console.log('='.repeat(60));
  console.log('🔵 FACEBOOK REGISTRATION BOT - LOOP MODE');
  console.log('='.repeat(60));

  // Init Google Sheets
  const sheetsReady = !CONFIG.useGoogleSheets || await initGoogleSheets();
  if (!sheetsReady) {
    console.error('❌ Gagal inisialisasi Google Sheets. Keluar.');
    process.exit(1);
  }

  let registrationCount = 0;
  let successCount = 0;

  // Loop terus-menerus
  while (registrationCount < CONFIG.maxRegistrations) {
    registrationCount++;
    console.log(`\n\n${'#'.repeat(60)}`);
    console.log(`# REGISTRASI KE-${registrationCount}`);
    console.log(`${'#'.repeat(60)}`);

    try {
      const result = await registerFacebook();
      fs.appendFileSync(CONFIG.resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        ...result,
      }) + '\n');

      // Jika skip karena bukan Indonesia, langsung retry tanpa delay
      if (result.skipped) {
        console.log(`\n⏭️ IP bukan Indonesia, langsung retry...`);
        registrationCount--; // Tidak hitung sebagai percobaan
        await delay(2000); // Delay singkat saja
        continue;
      }

      if (result.success && result.cookieString) {
        successCount++;

        // Simpan ke Google Sheets
        if (CONFIG.useGoogleSheets) await appendToSheet(result);

        console.log(`\n✅ Sukses! Total: ${successCount}/${registrationCount}`);
      } else {
        console.log(`\n⚠️ Registrasi tidak berhasil sepenuhnya`);
      }

    } catch (err) {
      console.error(`\n❌ Error di registrasi ke-${registrationCount}:`, err.message);
    }

    // Delay sebelum registrasi berikutnya
    if (registrationCount < CONFIG.maxRegistrations) {
      console.log(`\n⏳ Menunggu ${CONFIG.delayBetweenRegistrations / 1000} detik sebelum registrasi berikutnya...`);
      await delay(CONFIG.delayBetweenRegistrations);
    }
  }

  console.log('\nProbe run complete.');
}

// Jalankan
main().catch(console.error);
