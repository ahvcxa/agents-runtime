# agents-runtime — Hızlı Başlangıç Rehberi

> **Not:** Bu rehber Türkçe'dir. English version: [README.md](../../../README.md)

## 🎯 Ne bu? Neden ihtiyacımız var?

**agents-runtime**, kodunuzu otomatik olarak analiz eden, güvenlik açıklarını bulan ve kodun kalitesini kontrol eden bir **AI agent motoru**'dur.

- ✅ Kodunuzu otomatik analiz et
- ✅ Güvenlik açıklarını bul (OWASP Top 10)
- ✅ Kod kalitesi metriklerini ölç
- ✅ Python ve JavaScript desteği
- ✅ Claude, GPT, Gemini ile entegre et

## ⚡ 5 Dakikalık Başlangıç

### 1. Kurulum

```bash
npm run setup
```

Etkileşimli bir sihirbaz seni rehber edecek. Sadece soruları cevapla!

**İlk çalıştırmada ne soracak?**
- 📁 Proje dizini (varsayılan: mevcut dizin)
- 🤖 Agent tipi (observer, executor, fullstack, orchestrator, security-only)
- 🐍 Python desteği (opsiyonel)
- 💾 Bellek depolama (in-memory, file-based, redis)
- 🔄 CI/CD entegrasyonu (GitHub Actions, GitLab CI, vb.)

### 2. İlk Analiz

```bash
# Kurulum sonrası, proje klasöründesin
# npm scripts ile komutu çalıştır:

npm run analyze -- src/

npm run audit -- src/
```

**İşte! Bitirdin!** 🎉

## 📚 Temel Komutlar

Kurulum sonrası `npm run` ile:

| Komut | Ne yapar | Örnek |
|-------|----------|-------|
| `npm run analyze` | Kod kalitesini analiz et | `npm run analyze -- src/ lib/` |
| `npm run audit` | Güvenlik açıkları bul | `npm run audit -- src/ config/` |
| `npm run check` | Yapılandırmayı doğrula | `npm run check` |
| `npm run list` | Mevcut skills'i göster | `npm run list` |
| `npm run events` | Son olayları göster | `npm run events` |

## 🔍 Analiz Çıktısı Nasıl Okunur?

```
✓ Analysis completed in 234ms
Found 5 findings:

CRITICAL (1)
  src/app.js:45 — SQL injection: unsanitized query in buildQuery()
  ... and 0 more

HIGH (2)
  src/auth.js:120 — Hardcoded API key found
  src/config.js:8 — Weak MD5 hash usage
  ... and 0 more

MEDIUM (2)
  src/utils.js:34 — Cyclomatic complexity = 12 (threshold: 10)
  src/helpers.js:56 — Code duplication: 8 lines identical
```

### Sonucu Anlamak

| Seviye | Anlamı | Aksyon |
|--------|--------|--------|
| 🔴 **CRITICAL** | Güvenlik tehditesi | Hemen düzelt |
| 🟠 **HIGH** | Ciddi sorun | Kısa vadede düzelt |
| 🟡 **MEDIUM** | Konuşulması gereken | Bu sprintte planla |
| 🟢 **LOW** | Gelecek için not | Listelemeye al |
| ⚪ **INFO** | Bilgilendirme | İsteğe bağlı |

## 🛠️ Yaygın Görevler

### Config değiştirmek

```bash
# agent.yaml dosyasını aç
cat agent.yaml

# Düzenle (herhangi bir text editor'ü kullan)
nano agent.yaml
```

### Belirli dosyaları hariç tutmak

`agent.yaml`'da `read_paths`'ı değiştir:

```yaml
agent:
  read_paths:
    - "src/"
    - "lib/"
    # - "node_modules/" ← hariç tut
    # - "build/" ← hariç tut
```

### Python desteğini etkinleştir

```bash
# Python yüklü mü kontrol et
python3 --version

# agent.yaml'da ayarla
# settings.json'da python_analysis: true
```

### Raporu kaydet

```bash
# JSON olarak kaydet
agents analyze src/ --export report.json

# HTML olarak kaydet
agents analyze src/ --export report.html
```

## ❓ Sık Sorulan Sorular

### S: "agent.yaml: No such file or directory" hatası alıyorum
**C:** `npm run setup` komutunu çalıştır. Bu sana `agent.yaml`'ı otomatik oluşturacak.

### S: Python kodu analiz edilmiyor
**C:** `settings.json`'da `"python_analysis": { "enabled": true }` olup olmadığını kontrol et.

### S: Analiz çok yavaş
**C:** `read_paths`'ı küçült ve `node_modules`, `build` gibi klasörleri hariç tut.

### S: Başka bir projeye taşı mak istiyorum
**C:** Sadece `.agents/` klasörünü yeni projeye kopyala ve çalışmaya devam et.

## 📖 Sonraki Adımlar

1. **Detaylı rehberi oku:** `.agents/NEXT_STEPS.md`
2. **Sorun giderme:** `.agents/TROUBLESHOOTING.md`
3. **MCP entegrasyonu:** Claude, Cursor, Windsurf'te kullan
4. **CI/CD:** GitHub Actions, GitLab CI'ye entegre et
5. **Custom skills:** Kendi kurallarını yaz

## 🚀 Örnek: GitHub Actions'ta Otomatikleştirme

`.github/workflows/agent-audit.yml` dosyası oluştur:

```yaml
name: Güvenlik Denetimi
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: agents audit src/
```

Artık her commit'te analiz otomatik çalışacak!

## 💡 İpuçları

- 🎯 **Hergün çalıştır:** Analiz scripts'ini günlük CI/CD'ye ekle
- 📊 **Trend takip et:** `--diff` ile geçmiş çalışmalarla karşılaştır
- 🔐 **Güvenlik öncelikli:** Kritik ve HIGH sorunları hemen düzelt
- 🤖 **Otomasyonda kullan:** Pre-commit hook'lar, GitHub Actions, Jenkins, vb.

## 🆘 Yardım

- **Belgeler:** `README.md` dosyasını oku
- **Sorun giderme:** `.agents/TROUBLESHOOTING.md`
- **Sorular:** GitHub Issues'ta soru sor
- **Geri bildirim:** GitHub Discussions'a katıl

---

**İyi kullanımlar!** 🎉

Her sorular varsa, GitHub'da issue açmaktan çekinme:
https://github.com/ahvcxa/agents-runtime/issues
