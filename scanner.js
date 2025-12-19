require('dotenv').config();
const { ethers } = require('ethers');

const TARGETS = [
  // Add your 150 pool addresses here, one per line
  // Example: '0xYourPoolAddress1',
];

const SCAN_BLOCKS = 7200;

async function scanAddress(provider, address, fromBlock, toBlock) {
  try {
    const traces = await provider.send('trace_filter', [{
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + toBlock.toString(16),
      toAddress: [address]
    }]);
    return traces;
  } catch (error) {
    return null;
  }
}

async function analyzeCallers(provider, traces) {
  const callers = {};
  for (const trace of traces) {
    const caller = trace.action?.from;
    if (caller) {
      if (!callers[caller]) callers[caller] = { count: 0, isContract: false };
      callers[caller].count++;
    }
  }
  for (const [address, data] of Object.entries(callers)) {
    const code = await provider.getCode(address);
    data.isContract = code !== '0x';
  }
  return callers;
}

async function main() {
  console.log('🔍 Multi-Pool Scanner\n');
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - SCAN_BLOCKS;
  
  console.log(\`Scanning \${TARGETS.length} addresses from block \${fromBlock} to \${latestBlock}\n\`);
  
  const results = [];
  for (let i = 0; i < TARGETS.length; i++) {
    process.stdout.write(\`\r[\${i + 1}/\${TARGETS.length}] Scanning...\`);
    const traces = await scanAddress(provider, TARGETS[i], fromBlock, latestBlock);
    if (traces && traces.length > 0) {
      const callers = await analyzeCallers(provider, traces);
      results.push({ address: TARGETS[i], traceCount: traces.length, uniqueCallers: Object.keys(callers).length, callers });
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n\nRESULTS:\n');
  if (results.length === 0) {
    console.log('No activity found\n');
    return;
  }
  
  results.sort((a, b) => b.traceCount - a.traceCount);
  for (const r of results) {
    console.log(\`\n\${r.address}: \${r.traceCount} traces, \${r.uniqueCallers} callers\`);
    const top = Object.entries(r.callers).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
    for (const [addr, data] of top) {
      console.log(\`  \${addr} (\${data.isContract ? 'Contract' : 'EOA'}) - \${data.count} calls\`);
    }
  }
  console.log(\`\n\nTotal: \${results.length}/\${TARGETS.length} active addresses\n\`);
}

main().catch(console.error);
