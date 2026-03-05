/**
 * User Reset CLI Script
 * 
 * Resets a user's account by clearing all their trading data via API
 * Usage:
 *   npx tsx scripts/reset-user.ts --token=<sessionToken>
 */

import 'dotenv/config';

interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

interface ApiSuccessResponse {
    success: true;
    message: string;
    data?: any;
}

type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

async function callResetEndpoint(token: string): Promise<void> {
    const baseUrl = process.env.API_URL || 'http://localhost:3000';
    const endpoint = `${baseUrl}/api/v1/user/reset`;

    console.log('\n' + '='.repeat(70));
    console.log('  🔐 USER ACCOUNT RESET VIA API');
    console.log('='.repeat(70));
    console.log('');
    console.log('📡 Calling API endpoint...');
    console.log(`   Endpoint: ${endpoint}`);
    console.log('');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `authjs.session-token=${token}`,
            },
        });

        let data: ApiResponse;
        try {
            data = await response.json();
        } catch {
            console.error('');
            console.error('❌ Failed to parse API response');
            console.error(`   Status: ${response.status}`);
            console.error(`   Response: ${await response.text()}`);
            console.error('');
            process.exit(1);
        }

        if (!response.ok) {
            console.error('');
            console.error('❌ API Error:');
            console.error(`   Status: ${response.status}`);
            
            if ('error' in data && data.error) {
                console.error(`   Code: ${data.error.code}`);
                console.error(`   Message: ${data.error.message}`);
                if (data.error.details) {
                    console.error(`   Details: ${JSON.stringify(data.error.details)}`);
                }
            } else {
                console.error(`   Response: ${JSON.stringify(data)}`);
            }
            console.error('');
            process.exit(1);
        }

        if (!('success' in data) || !data.success) {
            console.error('');
            console.error('❌ Reset Failed:');
            if ('error' in data && data.error) {
                console.error(`   ${data.error.message}`);
            } else {
                console.error(`   Unknown error: ${JSON.stringify(data)}`);
            }
            console.error('');
            process.exit(1);
        }

        console.log('✅ Account reset successful!');
        console.log('');
        console.log('📈 Reset Summary:');
        console.log(`   ${data.message}`);
        if (data.data?.balance) {
            console.log(`   Balance: ₹${Number(data.data.balance).toLocaleString('en-IN')}`);
        }
        console.log('');
        console.log('='.repeat(70));
        console.log('');

    } catch (error) {
        console.error('');
        console.error('❌ Error calling reset endpoint:');
        if (error instanceof Error) {
            console.error(`   ${error.message}`);
            if (error.message.includes('ECONNREFUSED')) {
                console.error('');
                console.error('💡 Is the server running? Try:');
                console.error('   npm run dev');
            }
        } else {
            console.error('   Unknown error occurred');
        }
        console.error('');
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('\n❌ Session token is required\n');
        console.log('Usage: npx tsx scripts/reset-user.ts --token=<sessionToken>\n');
        console.log('Example:');
        console.log('  npx tsx scripts/reset-user.ts --token="eyJhbGciOiJkaXIi..."\n');
        console.log('💡 Get your session token from browser DevTools → Application → Cookies');
        console.log('   Look for: authjs.session-token\n');
        process.exit(1);
    }

    // Parse token from --token parameter
    const tokenArg = args.find(arg => arg.startsWith('--token='));
    
    if (!tokenArg) {
        console.log('\n❌ Invalid arguments\n');
        console.log('Usage: npx tsx scripts/reset-user.ts --token=<sessionToken>\n');
        process.exit(1);
    }

    const token = tokenArg.replace('--token=', '').trim();
    
    if (!token) {
        console.log('\n❌ Token value is empty\n');
        process.exit(1);
    }

    console.log('\n' + '='.repeat(70));
    console.log('  🔑 VERIFYING SESSION TOKEN');
    console.log('='.repeat(70));
    console.log('');
    console.log('📋 Token received (length: ' + token.length + ' chars)');
    console.log('');

    await callResetEndpoint(token);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
