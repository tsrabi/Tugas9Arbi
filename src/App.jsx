import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import * as snarkjs from 'snarkjs';
import { Card, Form, Input, Button, Typography, ConfigProvider, theme } from 'antd';
import { 
  UserOutlined, 
  LockOutlined, 
  UserAddOutlined, 
  LoginOutlined, 
  SafetyCertificateOutlined, 
  LoadingOutlined,
  CodeOutlined
} from '@ant-design/icons';
import './App.css';

const AUTH_MANAGER_ADDRESS = "0xa603a63F1b75aAddff2e25D22e02C8410C81F074";

const AUTH_MANAGER_ABI = [
  "function register(uint256 _commitment) public",
  "function login(uint256[2] calldata a, uint256[2][2] calldata b, uint256[2] calldata c, uint256[1] calldata input) public view returns (bool)",
  "function userCommitments(address) public view returns (uint256)"
];

function stringToBigInt(str) {
  return BigInt(ethers.utils.id(str));
}

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  const addLog = (message) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    setLogs(prev => [...prev, `[${timeStr}] ${message}`]);
  };

  const truncateVal = (val, length = 16) => {
    const str = val ? val.toString() : '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  };

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleRegister = async () => {
    if (!username || !password) return alert("Isi username & password!");
    setLogs([]);
    setLoading(true);
    setStatus("Menghubungkan ke Web3...");
    addLog("Memulai proses registrasi...");
    addLog("Menghubungkan ke Web3 Provider / MetaMask...");
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();
      addLog(`Wallet terhubung: ${userAddress}`);

      addLog("Memeriksa status registrasi wallet di smart contract Sepolia...");
      const contract = new ethers.Contract(AUTH_MANAGER_ADDRESS, AUTH_MANAGER_ABI, signer);
      const existingCommitment = await contract.userCommitments(userAddress);
      
      if (existingCommitment.toString() !== "0") {
        addLog("❌ Registrasi Dibatalkan: Alamat wallet ini sudah terdaftar di smart contract!");
        setStatus("❌ Alamat wallet sudah terdaftar!");
        setLoading(false);
        return;
      }
      
      addLog("Alamat wallet bersih. Memulai perhitungan kriptografi lokal...");
      addLog("Identitas user dikonversi ke BigInt (salt & password)...");
      const salt = stringToBigInt(username);
      const secretPassword = stringToBigInt(password);
      addLog(`-> Salt Hash (BigInt): ${truncateVal(salt, 24)}`);
      addLog(`-> Password Hash (BigInt): ${truncateVal(secretPassword, 24)}`);
      
      addLog("Men-generate proof ZKP secara lokal via snarkjs.groth16.fullProve...");
      const { publicSignals } = await snarkjs.groth16.fullProve(
        { password: secretPassword, salt: salt },
        "/zk/auth.wasm",
        "/zk/auth_final.zkey"
      );
      
      const commitment = publicSignals[0];
      addLog("Commitment berhasil di-generate secara lokal.");
      addLog(`-> Public Signals (Commitment): ${truncateVal(commitment, 24)}`);
      
      addLog("Mengirimkan commitment registrasi ke smart contract...");
      const tx = await contract.register(commitment);
      addLog(`Transaksi terkirim. Hash: ${tx.hash}`);
      
      addLog("Menunggu konfirmasi transaksi (mined) dari blockchain...");
      await tx.wait();
      
      addLog("🎉 Hasil verifikasi akhir smart contract: VALID! Registrasi berhasil dicatat.");
      setStatus("🎉 Registrasi Berhasil!");
    } catch (err) {
      console.error(err);
      addLog(`❌ Registrasi Gagal: ${err.message}`);
      setStatus("❌ Registrasi Gagal: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) return alert("Isi username & password!");
    setLogs([]);
    setLoading(true);
    setStatus("Menghubungkan ke Web3...");
    addLog("Memulai proses pembuktian login kriptografi...");
    addLog("Menghubungkan ke Web3 Provider / MetaMask...");
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();
      addLog(`Wallet terhubung: ${userAddress}`);

      addLog("Memeriksa status registrasi wallet di smart contract Sepolia...");
      const contract = new ethers.Contract(AUTH_MANAGER_ADDRESS, AUTH_MANAGER_ABI, signer);
      const existingCommitment = await contract.userCommitments(userAddress);
      
      if (existingCommitment.toString() === "0") {
        addLog("❌ Login Dibatalkan: Alamat wallet ini belum terdaftar di smart contract!");
        setStatus("❌ Alamat wallet belum terdaftar!");
        setLoading(false);
        return;
      }
      
      addLog("Wallet terverifikasi terdaftar. Memulai konversi BigInt (salt & password)...");
      const salt = stringToBigInt(username);
      const secretPassword = stringToBigInt(password);
      addLog(`-> Salt Hash (BigInt): ${truncateVal(salt, 24)}`);
      addLog(`-> Password Hash (BigInt): ${truncateVal(secretPassword, 24)}`);
      
      addLog("Men-generate proof ZKP secara lokal di browser melalui snarkjs.groth16.fullProve...");
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { password: secretPassword, salt: salt },
        "/zk/auth.wasm",
        "/zk/auth_final.zkey"
      );
      addLog("ZKP Proof dan Public Signals berhasil dibuat secara lokal.");
      addLog(`-> Public Signals (Commitment): ${truncateVal(publicSignals[0], 24)}`);

      addLog("Mengekstraksi calldata pembuktian matematika...");
      const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
      addLog("Solidity calldata terenkripsi berhasil di-generate.");
      
      const argv = JSON.parse("[" + calldata + "]");
      const a = argv[0];
      const b = argv[1];
      const c = argv[2];
      const input = argv[3];
      addLog(`-> Parameter Proof A: [${truncateVal(a[0], 12)}, ${truncateVal(a[1], 12)}]`);
      addLog(`-> Parameter Proof B: [[${truncateVal(b[0][0], 10)}, ${truncateVal(b[0][1], 10)}], [${truncateVal(b[1][0], 10)}, ${truncateVal(b[1][1], 10)}]]`);
      addLog(`-> Parameter Proof C: [${truncateVal(c[0], 12)}, ${truncateVal(c[1], 12)}]`);
      addLog(`-> Public Input: [${truncateVal(input[0], 24)}]`);
      
      addLog("Memanggil smart contract ke blockchain Sepolia via ethers.js...");
      addLog(`Mengevaluasi bukti ZKP via login(a, b, c, [${truncateVal(input[0], 16)}])...`);
      const success = await contract.login(a, b, c, input);
      if (success) {
        addLog("✅ Hasil verifikasi akhir smart contract: VALID! Login sukses!");
        setStatus("✅ LOGIN SUKSES!");
      } else {
        addLog("❌ Hasil verifikasi akhir smart contract: INVALID! Login gagal!");
        setStatus("❌ Login Gagal.");
      }
    } catch (err) {
      console.error(err);
      addLog(`❌ Login Gagal: ${err.message}`);
      setStatus("❌ Login Gagal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#0ea5e9',
          colorSuccess: '#14b8a6',
          colorWarning: '#f59e0b',
          colorBgBase: '#f8fafc',
          controlItemBg: '#ffffff',
          borderRadius: 16,
          fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      }}
    >
      <div className="cyber-background" />
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        padding: '24px',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ width: '100%', maxWidth: '540px' }}>
          <Card className="glass-container" bordered={false}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div className="cyber-badge">
                <span className="pulse" />
                <SafetyCertificateOutlined style={{ fontSize: 14 }} />
                <span>ZERO-KNOWLEDGE CRYPTOGRAPHY</span>
              </div>
              <Typography.Title level={2} style={{ 
                margin: '10px 0 6px 0', 
                fontWeight: 800, 
                fontSize: '34px',
                letterSpacing: '-0.7px',
                color: '#0f172a'
              }}>
                ZK-Auth Portal
              </Typography.Title>
              <Typography.Text style={{ display: 'block', fontSize: '15px', marginTop: '8px', color: '#475569', lineHeight: 1.7 }}>
                Daftar dan login aman on-chain menggunakan bukti Zero-Knowledge Proof yang modern dan elegan.
              </Typography.Text>
            </div>

            <Form layout="vertical" requiredMark={false}>
              <Form.Item 
                label={<span style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, letterSpacing: '1px' }}>USERNAME</span>}
                style={{ marginBottom: 22 }}
              >
                <Input 
                  placeholder="Masukkan username" 
                  prefix={<UserOutlined style={{ color: '#0ea5e9' }} />}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="cyber-input"
                  size="large"
                  disabled={loading}
                />
              </Form.Item>
              <Form.Item 
                label={<span style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, letterSpacing: '1px' }}>PASSWORD</span>}
                style={{ marginBottom: 26 }}
              >
                <Input.Password 
                  placeholder="Masukkan password" 
                  prefix={<LockOutlined style={{ color: '#0ea5e9' }} />}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="cyber-input"
                  size="large"
                  disabled={loading}
                />
              </Form.Item>

              <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                <Button 
                  type="primary" 
                  icon={<UserAddOutlined />}
                  loading={loading}
                  onClick={handleRegister}
                  className="btn-cyber-primary"
                  style={{ flex: 1 }}
                >
                  Daftar
                </Button>
                <Button 
                  type="primary" 
                  icon={<LoginOutlined />}
                  loading={loading}
                  onClick={handleLogin}
                  className="btn-cyber-secondary"
                  style={{ flex: 1 }}
                >
                  Masuk
                </Button>
              </div>
            </Form>

            {logs.length > 0 && (
              <div style={{ marginTop: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '11px', fontWeight: 700, letterSpacing: '1px' }}>
                    <CodeOutlined style={{ color: '#2dd4bf' }} />
                    <span>TERMINAL LOG KRIPTOGRAFI & AKTIVITAS</span>
                  </div>
                  <Button 
                    type="link" 
                    size="small" 
                    onClick={() => setLogs([])} 
                    style={{ color: '#64748b', fontSize: '11px', padding: 0, height: 'auto' }}
                  >
                    CLEAR
                  </Button>
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  background: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderLeft: '4px solid #14b8a6',
                  borderRadius: '18px',
                  padding: '18px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  boxShadow: 'inset 0 1px 4px rgba(15, 23, 42, 0.04)',
                  fontSize: '12px',
                  lineHeight: '1.6'
                }}>
                  {logs.map((log, index) => {
                    let color = '#e2e8f0';
                    if (log.includes('✅') || log.includes('VALID') || log.includes('berhasil') || log.includes('Berhasil')) {
                      color = '#14b8a6';
                    } else if (log.includes('❌') || log.includes('ERROR') || log.includes('Gagal') || log.includes('gagal') || log.includes('INVALID')) {
                      color = '#f43f5e';
                    } else if (log.includes('ZKP') || log.includes('pembuktian') || log.includes('snarkjs') || log.includes('Commitment')) {
                      color = '#a5b4fc';
                    } else if (log.includes('Sepolia') || log.includes('smart contract') || log.includes('blockchain') || log.includes('Wallet')) {
                      color = '#fbbf24';
                    }
                    
                    return (
                      <div key={index} style={{ color, marginBottom: '6px', wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace" }}>
                        {log}
                      </div>
                    );
                  })}
                  {loading && (
                    <div style={{ color: '#6366f1', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                      <LoadingOutlined style={{ fontSize: '12px' }} />
                      <span style={{ fontSize: '11px', letterSpacing: '0.5px' }}>Executing blockchain and cryptography steps...</span>
                      <span className="terminal-cursor" style={{ width: '6px', height: '12px', backgroundColor: '#6366f1' }} />
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </ConfigProvider>
  );
}