import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Modal,
  SafeAreaView, StatusBar, Animated, Vibration, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';

// ─── Marche ───────────────────────────────────────────────────
const MARCHE = ['IVECO','MERCEDES','IIA','OTOKAR','KNORR','WABCO','MANN','ALTRO'];

// ─── Palette ──────────────────────────────────────────────────
const C = {
  bg: '#0F0F14', surface: '#1A1A24', card: '#22222F', border: '#2E2E3E',
  accent: '#6C63FF', accentLight: '#8B85FF', green: '#1DB97A',
  red: '#E24B4A', text: '#F0F0F8', muted: '#8888A0', white: '#FFFFFF',
};

function getNow() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function buildCSV(registro) {
  const righe = [
    ['Data/Ora','Barcode','Codice Prodotto','Marca','Quantita','Originale'],
    ...registro.map(r => [
      r.dataOra, r.barcode, r.codice, r.marca, r.quantita,
      r.originale ? 'SI' : 'NO',
    ]),
  ];
  return '\uFEFF' + righe
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';'))
    .join('\n');
}

function RigaProdotto({ item, index, onDelete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[styles.riga, { opacity: fadeAnim }]}>
      <View style={styles.rigaNum}>
        <Text style={styles.rigaNumText}>{index + 1}</Text>
      </View>
      <View style={styles.rigaInfo}>
        <Text style={styles.rigaBarcode}>{item.barcode}</Text>
        <Text style={styles.rigaSub}>{item.marca} · cod. {item.codice} · qty {item.quantita} · {item.originale ? '✦ Orig.' : '◇ No orig.'}</Text>
        <Text style={styles.rigaData}>{item.dataOra}</Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(index)} style={styles.rigaDelete}>
        <Text style={{ color: C.red, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]   = useState(false);
  const [scanned, setScanned]     = useState(false);
  const [scanTarget, setScanTarget] = useState('barcode');

  const [barcode, setBarcode]     = useState('');
  const [codice, setCodice]       = useState('');
  const [marca, setMarca]         = useState('');
  const [showMarcheModal, setShowMarcheModal] = useState(false);
  const [quantita, setQuantita]   = useState('');
  const [originale, setOriginale] = useState(false);

  const [registro, setRegistro]   = useState([]);
  const [oraCorrente, setOraCorrente] = useState(getNow());
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('form');

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => setOraCorrente(getNow()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const apriScanner = async (target = 'barcode') => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permesso negato', "Consenti l'accesso alla fotocamera nelle impostazioni.");
        return;
      }
    }
    setScanTarget(target);
    setScanned(false);
    setScanning(true);
  };

  const onBarcodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(80);
    if (scanTarget === 'codice') setCodice(data);
    else setBarcode(data);
    setScanning(false);
  };

  const aggiungi = () => {
    if (!barcode.trim()) { Alert.alert('Campo mancante', 'Scansiona o inserisci un codice a barre.'); return; }
    if (!quantita.trim()) { Alert.alert('Campo mancante', 'Inserisci la quantità.'); return; }
    const item = {
      barcode: barcode.trim(), codice: codice.trim() || '—',
      marca: marca || '—', quantita: quantita.trim(),
      originale, dataOra: getNow(),
    };
    setRegistro(prev => [item, ...prev]);
    setBarcode(''); setCodice(''); setMarca(''); setQuantita(''); setOriginale(false);
  };

  const eliminaRiga = (index) => {
    Alert.alert('Elimina', 'Rimuovere questa voce?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: () =>
          setRegistro(prev => prev.filter((_, i) => i !== index)) },
    ]);
  };

  const svuotaRegistro = () => {
    if (registro.length === 0) return;
    Alert.alert('Svuota registro', `Eliminare tutte le ${registro.length} voci?`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Svuota', style: 'destructive', onPress: () => setRegistro([]) },
    ]);
  };

  // ── Salva CSV e restituisce il percorso ────────────────────
  const salvaCSV = async () => {
    const csv = buildCSV(registro);
    const nomeFile = `inventario_${new Date().toISOString().slice(0,10)}.csv`;
    const path = FileSystem.cacheDirectory + nomeFile;
    await FileSystem.writeAsStringAsync(path, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return path;
  };

  // ── Esporta / condividi CSV ────────────────────────────────
  const esportaCSV = async () => {
    if (registro.length === 0) {
      Alert.alert('Registro vuoto', 'Aggiungi almeno un prodotto prima di esportare.');
      return;
    }
    setLoading(true);
    try {
      const path = await salvaCSV();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/csv',
          dialogTitle: 'Salva o condividi il file CSV',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('File salvato', `Percorso:\n${path}`);
      }
    } catch (e) {
      Alert.alert('Errore', e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Invia per email con allegato CSV ──────────────────────
  const inviaEmail = async () => {
    if (registro.length === 0) {
      Alert.alert('Registro vuoto', 'Aggiungi almeno un prodotto prima di inviare.');
      return;
    }
    setLoading(true);
    try {
      const disponibile = await MailComposer.isAvailableAsync();
      if (!disponibile) {
        Alert.alert('Nessuna app email', "Installa e configura Outlook o Gmail sul dispositivo.");
        return;
      }
      const path = await salvaCSV();
      const data = new Date();
      const dataStr = `${data.getDate()}/${data.getMonth()+1}/${data.getFullYear()}`;
      await MailComposer.composeAsync({
        subject: `Inventario Barcode - ${dataStr} (${registro.length} prodotti)`,
        body: `In allegato il registro inventario del ${dataStr}.\n${registro.length} prodotti registrati.\n\nInviato da Scanner Inventario.`,
        attachments: [path],
      });
    } catch (e) {
      Alert.alert('Errore', 'Impossibile aprire il client email:\n' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Scanner a schermo intero ──────────────────────────────
  if (scanning) {
    return (
      <View style={styles.scannerContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={onBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr','ean13','ean8','code128','code39','upc_a','upc_e','pdf417','datamatrix'],
          }}
        />
        <View style={styles.mirino}>
          <View style={styles.mirinoBox}>
            <View style={[styles.angolo, styles.angoloTL]} />
            <View style={[styles.angolo, styles.angoloTR]} />
            <View style={[styles.angolo, styles.angolooBL]} />
            <View style={[styles.angolo, styles.angolooBR]} />
          </View>
          <Text style={styles.mirinoTesto}>
            {scanTarget === 'codice' ? 'Inquadra il codice prodotto' : 'Inquadra il codice a barre'}
          </Text>
        </View>
        <TouchableOpacity style={styles.scannerClose} onPress={() => setScanning(false)}>
          <Text style={styles.scannerCloseText}>✕  Annulla</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── UI principale ─────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Scanner Inventario</Text>
          <Text style={styles.headerOra}>{oraCorrente}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{registro.length}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab==='form' && styles.tabActive]} onPress={() => setTab('form')}>
          <Text style={[styles.tabText, tab==='form' && styles.tabTextActive]}>Inserimento</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab==='lista' && styles.tabActive]} onPress={() => setTab('lista')}>
          <Text style={[styles.tabText, tab==='lista' && styles.tabTextActive]}>Registro ({registro.length})</Text>
        </TouchableOpacity>
      </View>

      {tab === 'form' ? (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.card}>
            <Text style={styles.label}>CODICE A BARRE</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 10, marginBottom: 0 }]}
                placeholder="Scansiona o digita..."
                placeholderTextColor={C.muted}
                value={barcode} onChangeText={setBarcode} autoCorrect={false}
              />
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity style={styles.btnScan} onPress={() => apriScanner('barcode')}>
                  <Text style={styles.btnScanText}>📷</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>DATI PRODOTTO</Text>

            <Text style={styles.fieldLabel}>Codice prodotto</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 10, marginBottom: 0 }]}
                placeholder="Es. SKU-00123" placeholderTextColor={C.muted}
                value={codice} onChangeText={setCodice} autoCorrect={false}
              />
              <TouchableOpacity style={[styles.btnScan, { backgroundColor: C.accentLight }]} onPress={() => apriScanner('codice')}>
                <Text style={styles.btnScanText}>📷</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 10 }} />

            <Text style={styles.fieldLabel}>Marca</Text>
            <TouchableOpacity style={styles.dropdown} onPress={() => setShowMarcheModal(true)}>
              <Text style={marca ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {marca || 'Seleziona marca...'}
              </Text>
              <Text style={styles.dropdownArrow}>▾</Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Quantità rilevata</Text>
            <TextInput style={styles.input} placeholder="Es. 5" placeholderTextColor={C.muted}
              value={quantita} onChangeText={setQuantita} keyboardType="numeric" />

            <Text style={styles.fieldLabel}>Tipo ricambio</Text>
            <TouchableOpacity
              style={[styles.toggleRow, originale && styles.toggleRowAttivo]}
              onPress={() => setOriginale(v => !v)} activeOpacity={0.8}
            >
              <View>
                <Text style={[styles.toggleLabel, originale && styles.toggleLabelAttivo]}>
                  {originale ? '✦  ORIGINALE' : '◇  NON ORIGINALE'}
                </Text>
                <Text style={styles.toggleSub}>
                  {originale ? 'Ricambio originale del produttore' : 'Ricambio aftermarket / compatibile'}
                </Text>
              </View>
              <View style={[styles.togglePill, originale && styles.togglePillAttivo]}>
                <View style={[styles.toggleDot, originale && styles.toggleDotAttivo]} />
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btnAggiungi} onPress={aggiungi}>
            <Text style={styles.btnAggiungiText}>+ Aggiungi al registro</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnEsporta} onPress={esportaCSV} disabled={loading}>
            {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnEsportaText}>📊  Esporta CSV (Excel)</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnEmail} onPress={inviaEmail} disabled={loading}>
            {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnEmailText}>✉️  Invia per email</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {registro.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>Nessun prodotto nel registro</Text>
              <Text style={styles.emptySub}>Vai su "Inserimento" per aggiungere voci</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll}>
              {registro.map((item, i) => (
                <RigaProdotto key={i} item={item} index={i} onDelete={eliminaRiga} />
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
          <View style={styles.listaFooter}>
            <TouchableOpacity style={styles.btnEsporta} onPress={esportaCSV} disabled={loading}>
              {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnEsportaText}>📊  Esporta CSV</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnEmail} onPress={inviaEmail} disabled={loading}>
              {loading ? <ActivityIndicator color={C.white} /> : <Text style={styles.btnEmailText}>✉️  Invia per email</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSvuota} onPress={svuotaRegistro}>
              <Text style={styles.btnSvuotaText}>🗑  Svuota registro</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal selezione marca */}
      <Modal visible={showMarcheModal} transparent animationType="slide"
        onRequestClose={() => setShowMarcheModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1}
          onPress={() => setShowMarcheModal(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitolo}>Seleziona la marca</Text>
            {MARCHE.map(m => (
              <TouchableOpacity key={m}
                style={[styles.modalOpzione, marca === m && styles.modalOpzioneAttiva]}
                onPress={() => { setMarca(m); setShowMarcheModal(false); }}>
                <Text style={[styles.modalOpzioneText, marca === m && styles.modalOpzioneTextAttiva]}>{m}</Text>
                {marca === m && <Text style={{ color: C.accent, fontSize: 16 }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalChiudi} onPress={() => setShowMarcheModal(false)}>
              <Text style={styles.modalChiudiText}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: 0.3 },
  headerOra: { fontSize: 12, color: C.muted, marginTop: 2 },
  badge: { backgroundColor: C.accent, borderRadius: 20, minWidth: 36, height: 36, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  badgeText: { color: C.white, fontSize: 15, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: C.surface, marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: C.white },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  label: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 1.2, marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: C.muted, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  btnScan: { backgroundColor: C.accent, borderRadius: 10, width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  btnScanText: { fontSize: 22 },
  dropdown: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownValue: { color: C.text, fontSize: 15, fontWeight: '500' },
  dropdownPlaceholder: { color: C.muted, fontSize: 15 },
  dropdownArrow: { color: C.accent, fontSize: 18, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  toggleRowAttivo: { borderColor: C.green, backgroundColor: C.green + '11' },
  toggleLabel: { color: C.muted, fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  toggleLabelAttivo: { color: C.green },
  toggleSub: { color: C.muted, fontSize: 11, marginTop: 3 },
  togglePill: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 3 },
  togglePillAttivo: { backgroundColor: C.green },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.muted, alignSelf: 'flex-start' },
  toggleDotAttivo: { backgroundColor: C.white, alignSelf: 'flex-end' },
  btnAggiungi: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  btnAggiungiText: { color: C.white, fontSize: 15, fontWeight: '700' },
  btnEsporta: { backgroundColor: '#217346', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  btnEsportaText: { color: C.white, fontSize: 15, fontWeight: '700' },
  btnEmail: { backgroundColor: '#0072C6', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  btnEmailText: { color: C.white, fontSize: 15, fontWeight: '700' },
  btnSvuota: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.red, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  btnSvuotaText: { color: C.red, fontSize: 14, fontWeight: '600' },
  riga: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: C.border },
  rigaNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent + '33', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rigaNumText: { color: C.accentLight, fontSize: 12, fontWeight: '700' },
  rigaInfo: { flex: 1 },
  rigaBarcode: { color: C.text, fontSize: 14, fontWeight: '600' },
  rigaSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  rigaData: { color: C.accent + '99', fontSize: 11, marginTop: 2 },
  rigaDelete: { padding: 8 },
  listaFooter: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: C.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySub: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 8 },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  mirino: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  mirinoBox: { width: 260, height: 180, position: 'relative' },
  angolo: { position: 'absolute', width: 30, height: 30, borderColor: C.accent, borderWidth: 3 },
  angoloTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  angoloTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  angolooBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  angolooBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  mirinoTesto: { color: C.white, marginTop: 24, fontSize: 14, fontWeight: '500' },
  scannerClose: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  scannerCloseText: { color: C.white, fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: C.border },
  modalTitolo: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  modalOpzione: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginBottom: 4 },
  modalOpzioneAttiva: { backgroundColor: C.accent + '22' },
  modalOpzioneText: { color: C.text, fontSize: 15 },
  modalOpzioneTextAttiva: { color: C.accent, fontWeight: '700' },
  modalChiudi: { marginTop: 10, paddingVertical: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border },
  modalChiudiText: { color: C.muted, fontSize: 14, fontWeight: '600' },
});
