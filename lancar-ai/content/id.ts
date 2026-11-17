import type { Dictionary } from "./en";

/** Indonesian copy. Typed against the English dictionary: every key must exist in both languages. */
export const id: Dictionary = {
  meta: {
    title: "Lancar AI | AI yang praktis untuk UMKM di Bali dan Jakarta",
    titleTemplate: "%s | Lancar AI",
    description:
      "Kami datang ke tempat usaha Anda, mempelajari cara kerja tim, lalu memasang AI yang menghemat waktu setiap minggu: balasan dalam berbagai bahasa, booking, tagihan, laporan. Audit di lokasi dengan harga tetap, dalam bahasa Indonesia dan Inggris.",
  },

  nav: {
    services: "Layanan",
    process: "Cara kerja",
    sectors: "Sektor",
    pricing: "Harga",
    about: "Tentang",
    blog: "Blog",
    contact: "Kontak",
    demo: "Demo langsung",
    quiz: "Kuis kesiapan",
    cta: "Konsultasi gratis",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
    language: "Bahasa",
    home: "Beranda Lancar AI",
  },

  common: {
    whatsapp: "Chat di WhatsApp",
    bookCall: "Konsultasi gratis 30 menit",
    contactUs: "Hubungi kami",
    learnMore: "Selengkapnya",
    whatsappGreeting: "Halo Lancar AI, saya ingin menjadwalkan konsultasi gratis tentang usaha saya.",
    fictional: "Contoh fiktif",
    from: "Mulai",
    free: "Gratis",
  },

  footer: {
    tagline: "Konsultan AI yang datang langsung ke lokasi, untuk UMKM di Bali dan Jakarta.",
    explore: "Jelajahi",
    try: "Coba sendiri",
    contact: "Kontak",
    areas: "Kunjungan langsung di Bali dan Jabodetabek",
    languages: "Kami berbahasa Indonesia dan Inggris",
    privacy: "Kebijakan privasi",
    rights: "Hak cipta dilindungi.",
  },

  home: {
    hero: {
      eyebrow: "Konsultan AI di lokasi · Bali dan Jakarta",
      title: "AI yang menyesuaikan cara kerja bisnis Anda",
      subtitle:
        "Kami datang ke tempat usaha Anda, melihat langsung cara tim bekerja, lalu memasang asisten AI untuk pekerjaan yang berulang: balasan dalam berbagai bahasa, booking, tagihan, laporan. Setelah itu kami terus mendampingi sampai semuanya berjalan lancar.",
      secondaryCta: "Cek kesiapan AI usaha Anda",
      points: ["Datang langsung ke lokasi", "Bahasa Indonesia dan Inggris", "Harga tetap, jelas sejak awal"],
      chat: {
        business: "Spa Embun Pagi · Ubud",
        status: "Asisten AI · membalas dalam hitungan detik",
        caption: "Satu nomor WhatsApp, empat bahasa, tanpa ada yang berjaga di meja depan.",
        staffNote: "Staf diberi tahu: booking baru, besok 16.00, 2 tamu",
        typing: "Mengetik",
      },
    },
    pains: {
      title: "Pernah mengalami ini?",
      items: [
        {
          title: "Pesan baru dibalas besok pagi",
          body: "Tamu bertanya soal booking pukul 23.00. Saat akhirnya dibalas, ia sudah memesan di tempat lain.",
        },
        {
          title: "Sepuluh pertanyaan yang sama, setiap hari",
          body: "Jam buka, harga, lokasi, ketersediaan. Karyawan terbaik Anda menghabiskan hari untuk menyalin dan menempel jawaban.",
        },
        {
          title: "Urusan admin menghabiskan malam",
          body: "Tagihan, pengingat pembayaran, rekap harian, dan daftar stok dikerjakan setelah tutup, secara manual, di tiga file berbeda.",
        },
        {
          title: "Pelanggan menulis dalam bahasa yang tidak dikuasai tim",
          body: "Mandarin, Korea, Rusia, Prancis. Calon pelanggannya nyata, tetapi balasannya hasil tebakan aplikasi penerjemah.",
        },
      ],
    },
    functions: {
      title: "Pekerjaan yang bisa diambil alih AI",
      intro:
        "Bukan robot pengganti karyawan, melainkan asisten yang mengerjakan bagian yang berulang, agar tim Anda punya waktu untuk pelanggan dan pekerjaan yang memang butuh manusia.",
      cta: "Lihat semua layanan",
    },
    process: {
      title: "Cara kami bekerja",
      intro: "Empat langkah. Anda tahu harganya sebelum setiap langkah dimulai.",
      cta: "Lihat metode kami selengkapnya",
    },
    why: {
      title: "Kenapa tidak langganan chatbot saja?",
      intro:
        "Boleh saja, dan kadang itu memang pilihan yang tepat. Kalau begitu, kami akan mengatakannya. Tetapi sebagian besar manfaatnya bukan terletak pada alatnya.",
      points: [
        {
          title: "Kami berangkat dari bisnis Anda, bukan dari produk",
          body: "Kami tidak terikat pada produk mana pun. Kami bekerja dengan Claude, ChatGPT, Gemini, Grok, dan lainnya, lalu merekomendasikan yang paling cocok dengan kebutuhan, anggaran, dan data Anda.",
        },
        {
          title: "Kami melihat yang tidak tertangkap formulir",
          body: "Bagaimana meja depan sebenarnya mencatat booking, file mana yang benar-benar dipakai, apa yang dicek pemilik setiap malam. Di situlah waktu terbuang, dan itu hanya terlihat di lokasi.",
        },
        {
          title: "Tim Anda tetap memegang kendali",
          body: "Setiap asisten yang kami pasang bisa menyerahkan percakapan ke manusia, dan staf Anda belajar mengoreksi serta menyempurnakannya. Akun dan datanya tetap milik Anda.",
        },
      ],
    },
    sectors: {
      title: "Untuk jenis usaha yang kami pahami",
      intro: "Contoh dari sektor yang paling sering kami tangani. Jika usaha Anda tidak ada di sini, metodenya tetap sama.",
    },
    try: {
      title: "Lihat sendiri sebelum percaya",
      demoTitle: "Ngobrol dengan asisten AI langsung",
      demoBody:
        "Chat dengan asisten sebuah spa, restoran, klinik, atau pemasok fiktif. Tulis dalam bahasa apa pun dan coba lakukan booking.",
      demoCta: "Coba demo",
      quizTitle: "Seberapa siap usaha Anda memakai AI?",
      quizBody:
        "Sepuluh pertanyaan, dua menit. Anda mendapat skor dan tiga ide konkret untuk usaha Anda. Hasilnya langsung terlihat tanpa perlu email.",
      quizCta: "Ikuti kuis",
    },
    pricing: {
      title: "Harga jelas sejak langkah pertama",
      intro: "Biaya audit dipotong penuh dari biaya implementasi jika Anda melanjutkan.",
      cta: "Lihat harga selengkapnya",
    },
    faq: {
      title: "Pertanyaan yang sering diajukan pemilik usaha",
      items: [
        {
          q: "Apakah AI akan menggantikan karyawan saya?",
          a: "Bukan itu yang kami pasang. Asisten mengambil alih tugas berulang seperti menjawab pertanyaan yang sama atau menyalin data antarfile. Tim Anda tetap memegang pekerjaan yang butuh pertimbangan, dan biasanya justru punya lebih banyak waktu untuk pelanggan.",
        },
        {
          q: "Tim saya tidak paham teknologi. Apakah itu masalah?",
          a: "Tidak. Sebagian besar solusi berjalan di alat yang sudah dipakai tim Anda, seperti WhatsApp dan spreadsheet. Pelatihan selalu menjadi bagian dari implementasi, dalam bahasa Indonesia atau Inggris.",
        },
        {
          q: "Apakah data pelanggan saya aman?",
          a: "Akun dibuat atas nama perusahaan Anda, jadi akun dan datanya milik Anda. Laporan audit menjelaskan ke mana setiap data mengalir, dan kami merekomendasikan paket bisnis yang tidak memakai data Anda untuk melatih model AI. Data sensitif seperti data kesehatan atau pembayaran ditangani lebih hati-hati, atau tidak dimasukkan ke AI sama sekali.",
        },
        {
          q: "Berapa biaya operasionalnya setiap bulan?",
          a: "Tergantung solusi dan volumenya. Ada yang berjalan dengan langganan bulanan, ada yang dihitung berdasarkan pemakaian. Laporan audit memberi perkiraan untuk setiap rekomendasi sebelum Anda memutuskan apa pun.",
        },
        {
          q: "WhatsApp sudah punya balasan otomatis gratis. Untuk apa saya butuh Anda?",
          a: "Untuk balasan otomatis sederhana, alat gratis mungkin sudah cukup, dan kami akan mengatakannya. Ceritanya berbeda ketika asisten perlu tahu ketersediaan dan harga yang sebenarnya, melayani beberapa bahasa, mencatat booking, atau terhubung ke sistem Anda yang lain. Di situ pula sebagian besar waktu bisa dihemat.",
        },
        {
          q: "Bagaimana jika AI memberi jawaban yang salah?",
          a: "Itu bisa terjadi, sama seperti pada karyawan baru. Kami membatasinya dengan tiga cara: asisten hanya menjawab dari informasi yang Anda setujui, ia menyerahkan percakapan ke manusia saat ragu, dan tim Anda meninjau percakapan pada minggu-minggu pertama agar bisa kami perbaiki.",
        },
        {
          q: "Apakah Anda melayani di luar Bali dan Jakarta?",
          a: "Kunjungan langsung kami mencakup Bali dan Jabodetabek. Untuk lokasi lain di Indonesia, hubungi kami: pekerjaan jarak jauh bisa digabung dengan kunjungan yang lebih singkat.",
        },
      ],
    },
    cta: {
      title: "Mulai dengan obrolan 30 menit",
      body: "Ceritakan usaha Anda. Jika AI bukan jawaban untuk masalah Anda, kami akan mengatakannya.",
    },
  },

  functions: {
    messages: {
      title: "Pesan pelanggan dan booking",
      body: "Balasan cepat dan akurat di WhatsApp, Instagram, dan email, dalam bahasa pelanggan, 24 jam sehari.",
      examples: [
        "Menjawab pertanyaan soal harga, jam buka, dan ketersediaan dari informasi Anda sendiri",
        "Mencatat booking dan perubahan jadwal, lalu memberi tahu staf",
        "Menyerahkan percakapan ke manusia begitu ia ragu",
        "Membalas dalam bahasa pelanggan dan merangkum percakapan untuk tim dalam bahasa Anda",
        "Mengirim konfirmasi dan pengingat agar tamu tidak batal datang tanpa kabar",
      ],
    },
    sales: {
      title: "Penjualan dan pemasaran",
      body: "Setiap calon pelanggan ditindaklanjuti dan kanal Anda tetap aktif, tanpa menambah beban kerja siapa pun.",
      examples: [
        "Menindaklanjuti calon pelanggan yang belum membalas",
        "Menyusun draf postingan, caption, dan promo dengan gaya Anda, dalam bahasa Indonesia dan Inggris",
        "Meminta ulasan dari pelanggan yang puas dan menyiapkan balasan untuk ulasan yang masuk",
        "Menyiapkan penawaran dan proposal dari brief singkat",
        "Menjaga deskripsi produk dan menu tetap seragam di semua platform",
      ],
    },
    finance: {
      title: "Keuangan dan administrasi",
      body: "Lebih sedikit mengetik, lebih sedikit salah, dan angka yang selalu terbaru saat Anda membutuhkannya.",
      examples: [
        "Membaca nota dan faktur pemasok, lalu memasukkannya ke spreadsheet atau software akuntansi Anda",
        "Menyiapkan tagihan dan pengingat pembayaran yang sopan",
        "Mengirim rekap penjualan dan kas harian ke WhatsApp pemilik",
        "Mencocokkan transfer bank dengan tagihan dan menandai yang belum masuk",
        "Mengumpulkan dokumen yang diminta akuntan Anda setiap bulan",
      ],
    },
    operations: {
      title: "Operasional dan stok",
      body: "Rutinitas harian, ditulis sekali dan dijalankan dengan cara yang sama setiap saat.",
      examples: [
        "Peringatan stok menipis dan draf pesanan pembelian",
        "Checklist harian dan catatan serah terima antarshift",
        "Mengubah pesan suara dari lapangan menjadi laporan yang rapi",
        "Memantau kiriman pemasok dan menagih yang terlambat",
        "Menjadwalkan perawatan dan housekeeping berdasarkan booking",
      ],
    },
    team: {
      title: "Tim dan SDM",
      body: "Setiap karyawan mendapat jawaban yang ia butuhkan tanpa harus menunggu manajer.",
      examples: [
        "Menyusun jadwal kerja dan mengatur tukar shift",
        "Menjawab pertanyaan staf tentang SOP dan kebijakan Anda",
        "Membuat panduan orientasi dan materi pelatihan untuk karyawan baru",
        "Menerjemahkan instruksi antara bahasa Indonesia dan Inggris",
        "Menyiapkan rekap absensi dan lembur untuk penggajian",
      ],
    },
    owner: {
      title: "Bahan keputusan untuk pemilik",
      body: "Lihat kondisi usaha Anda tanpa membuka lima file.",
      examples: [
        "Satu ringkasan mingguan sebagai pengganti lima spreadsheet",
        "Bertanya tentang angka usaha Anda dengan bahasa sehari-hari",
        "Menunjukkan apa yang laku, apa yang tidak, dan di mana waktu terbuang",
        "Membandingkan cabang, shift, atau musim secara berdampingan",
        "Memberi peringatan saat sebuah angka bergerak di luar kebiasaannya",
      ],
    },
  },

  services: {
    metaTitle: "Layanan",
    metaDescription:
      "Yang dikerjakan Lancar AI untuk UMKM: balasan pelanggan dan booking, penjualan dan pemasaran, keuangan dan administrasi, operasional, SDM, serta laporan untuk pemilik.",
    title: "Yang bisa kami kerjakan untuk Anda",
    intro:
      "Setiap usaha berbeda, karena itu kami selalu mulai dengan audit. Berikut area tempat kami paling sering menemukan jam kerja yang bisa dikembalikan.",
    examplesLabel: "Contoh umum",
    tools: {
      title: "Terhubung dengan alat yang sudah Anda pakai",
      body: "Anda tidak perlu mengganti sistem lebih dulu. Koneksi yang umum:",
      items: [
        "WhatsApp Business, Instagram, dan email",
        "Google Sheets, Excel, dan Google Drive",
        "Sistem booking dan manajemen properti",
        "Sistem kasir (POS) dan stok",
        "Software akuntansi",
        "Google Business Profile dan situs ulasan",
      ],
    },
    models: {
      title: "AI apa yang dipakai?",
      body: "Kami bekerja dengan Claude, ChatGPT, Gemini, Grok, dan lainnya. Pilihannya bergantung pada tugas, bahasa, biaya, dan tingkat sensitivitas data. Laporan audit menjelaskan pilihan kami untuk setiap solusi beserta biaya operasionalnya.",
    },
    notFit: {
      title: "Kapan kami akan menyarankan untuk tidak memakai AI",
      items: [
        "Jika template sederhana atau fitur gratis sudah menyelesaikan masalahnya",
        "Jika prosesnya sendiri belum jelas: kami bantu membereskannya lebih dulu",
        "Jika kesalahan akan berakibat mahal dan tidak ada yang bisa memeriksa hasilnya",
      ],
    },
  },

  process: {
    metaTitle: "Cara kerja",
    metaDescription:
      "Metode Lancar AI: konsultasi gratis, audit di lokasi dengan laporan tertulis, implementasi dengan pelatihan staf, dan pendampingan berkelanjutan.",
    title: "Dari obrolan pertama sampai tim Anda bisa menjalankannya sendiri",
    intro: "Empat langkah. Setiap langkah punya hasil yang jelas dan harga yang Anda ketahui sejak awal.",
    steps: [
      {
        title: "Konsultasi gratis",
        body: "30 menit lewat telepon, video, atau WhatsApp. Anda menceritakan apa yang menyita waktu tim, dan kami menjawab dengan jujur apakah AI bisa membantu.",
        short: "Anda menceritakan masalahnya. Kami menjawab dengan jujur apakah AI bisa membantu.",
        bullets: [
          "Kami bertanya tentang tim, pelanggan, dan rutinitas harian Anda",
          "Anda mendapat pendapat awal dan harga audit sesuai ukuran usaha",
          "Tanpa kewajiban dan tanpa rayuan penjualan",
        ],
      },
      {
        title: "Audit di lokasi",
        body: "Kami datang ke tempat usaha Anda, berbicara dengan orang-orang yang mengerjakannya, dan mengikuti alurnya dari pesan pertama pelanggan sampai tagihan terakhir.",
        short: "Kami berkunjung, berbicara dengan tim, dan mengikuti alur kerjanya. Anda menerima laporan tertulis berisi prioritas, biaya, dan waktu yang dihemat.",
        bullets: [],
      },
      {
        title: "Bangun dan latih",
        body: "Anda memilih apa yang ingin dibangun dari laporan. Kami memasangnya, menghubungkannya dengan alat yang sudah Anda pakai, dan melatih staf sampai mereka nyaman.",
        short: "Kami memasang solusi pilihan Anda, menghubungkannya dengan alat Anda, dan melatih staf.",
        bullets: [
          "Kami mulai dari satu atau dua solusi yang paling cepat balik modal",
          "Semua diuji dengan kasus nyata Anda sebelum dipakai",
          "Staf dilatih di lokasi dan menerima panduan singkat dalam bahasa mereka",
          "Manusia selalu bisa mengambil alih dari asisten",
          "Akun dibuat atas nama perusahaan Anda: data dan sistemnya milik Anda",
        ],
      },
      {
        title: "Pendampingan",
        body: "Usaha selalu berubah: harga, menu, staf, musim. Kami tetap mendampingi agar asisten ikut menyesuaikan, dan tim Anda selalu punya orang yang bisa dihubungi.",
        short: "Kami memantau, menyesuaikan, dan menyempurnakan seiring usaha Anda berkembang.",
        bullets: [
          "Tinjauan rutin atas apa yang dikerjakan asisten dan apa yang terlewat",
          "Penyesuaian saat harga, layanan, atau tim Anda berubah",
          "Pelatihan untuk staf baru",
          "Jalur WhatsApp langsung ke orang yang memahami sistem Anda",
        ],
      },
    ],
    tags: { free: "Gratis", from: "Mulai {price}", quote: "Harga tetap", monthly: "Bulanan, opsional" },
    audit: {
      lookTitle: "Yang kami pelajari",
      look: [
        "Bagaimana pertanyaan dan booking masuk, dan siapa yang menjawabnya",
        "Bagaimana penjualan, pembayaran, dan tagihan dicatat",
        "Bagaimana stok, pemasok, dan jadwal dikelola",
        "Alat, spreadsheet, dan grup chat mana yang benar-benar dipakai tim",
        "Di mana staf kehilangan waktu, dan pekerjaan apa yang ingin mereka tinggalkan",
      ],
      receiveTitle: "Yang Anda terima",
      receive: [
        "Laporan tertulis dalam bahasa Indonesia atau Inggris, paling lambat tujuh hari kerja setelah kunjungan",
        "Peta proses utama Anda sebagaimana benar-benar berjalan",
        "Daftar peluang berurutan prioritas, masing-masing dengan perkiraan jam yang dihemat, biaya pemasangan, dan biaya bulanan",
        "Perbaikan cepat yang bisa langsung diterapkan tim Anda, tanpa biaya",
        "Penawaran harga tetap untuk solusi yang layak dibangun",
      ],
      needTitle: "Yang kami butuhkan dari Anda",
      need: [
        "Akses ke tempat kerja selama kunjungan",
        "Waktu bersama pemilik atau manajer, dan staf yang mengerjakan tugas harian",
        "Kesempatan melihat alat dan file yang Anda pakai, dengan perjanjian kerahasiaan yang ditandatangani sebelumnya",
      ],
    },
  },

  sectors: {
    metaTitle: "Sektor",
    metaDescription:
      "Cara Lancar AI membantu usaha perhotelan dan spa, restoran dan retail, klinik dan jasa profesional, serta perdagangan dan manufaktur di Bali dan Jakarta.",
    title: "Sektor yang kami tangani",
    intro: "Metodenya sama di mana pun. Contohnya yang berbeda. Pilih yang paling dekat dengan usaha Anda.",
    painsTitle: "Ke mana waktu habis",
    solutionsTitle: "Yang biasanya kami pasang",
    scenarioLabel: "Contoh ilustrasi",
    demoCta: "Coba asisten langsung untuk sektor ini",
    otherTitle: "Sektor lain",
    items: {
      hospitality: {
        name: "Perhotelan dan spa",
        short: "Vila, hotel, spa, salon, operator tur dan aktivitas.",
        title: "AI untuk vila, hotel, spa, dan operator tur",
        intro:
          "Tamu memutuskan dengan cepat dan menulis kapan saja, dalam bahasa apa saja. Usaha yang menjawab lebih dulu dengan jelas biasanya yang mendapat booking.",
        pains: [
          "Pertanyaan masuk malam hari dan di platform yang tidak dipantau siapa pun",
          "Pertanyaan yang sama soal harga, lokasi, antar-jemput, dan ketersediaan sepanjang hari",
          "Booking disalin manual antara WhatsApp, kalender, dan sistem booking",
          "Ulasan tidak dibalas karena tidak ada yang sempat",
        ],
        solutions: [
          {
            title: "Asisten booking multibahasa",
            body: "Membalas di WhatsApp dan Instagram dalam bahasa tamu, mengecek ketersediaan yang sebenarnya, mencatat booking, dan memberi tahu meja depan.",
          },
          {
            title: "Pesan untuk tamu sebelum, selama, dan setelah menginap",
            body: "Info check-in, petunjuk arah, aturan vila, tawaran tambahan seperti antar-jemput atau perawatan, lalu ucapan terima kasih disertai permintaan ulasan.",
          },
          {
            title: "Satu kalender, bukan tiga",
            body: "Booking dari chat langsung dan dari platform masuk ke tempat yang sama, dan jadwal housekeeping serta terapis disusun dari sana.",
          },
          {
            title: "Balasan ulasan dengan gaya Anda",
            body: "Menyiapkan balasan personal untuk setiap ulasan, dalam bahasa ulasan itu ditulis, untuk disetujui manajer.",
          },
          {
            title: "Rekap harian untuk pemilik",
            body: "Tingkat hunian, booking, pendapatan, dan masalah yang belum selesai, dikirim ke WhatsApp Anda setiap pagi.",
          },
        ],
        scenario:
          "Sebuah spa di Ubud menerima pesan berbahasa Mandarin pukul 22.40 yang menanyakan pijat pasangan untuk esok hari. Asisten membalas dalam bahasa Mandarin dengan harga dan dua jadwal kosong, mengonfirmasi booking, dan jadwal terapis sudah diperbarui sebelum tim datang pagi harinya.",
      },
      food: {
        name: "Restoran, kafe, dan retail",
        short: "Reservasi, pesanan, stok, pemasok, ulasan, dan media sosial.",
        title: "AI untuk restoran, kafe, dan toko",
        intro:
          "Margin tipis dan hari kerja panjang. Penghematannya ada di rutinitas: reservasi, pesanan, stok, dan pembukuan setelah tutup.",
        pains: [
          "Reservasi dan pesanan tersebar di WhatsApp, Instagram, dan telepon",
          "Stok dihitung manual dan baru dipesan ketika sudah habis",
          "Rekap penjualan harian diketik setelah jam tutup",
          "Media sosial sepi setiap kali tim sedang sibuk",
        ],
        solutions: [
          {
            title: "Reservasi dan pesanan lewat WhatsApp",
            body: "Mencatat reservasi meja, katering, dan pre-order, menjawab pertanyaan menu dan alergi dari menu Anda sendiri, lalu mengirim ringkasannya ke dapur atau kasir.",
          },
          {
            title: "Peringatan stok dan pesanan pembelian",
            body: "Membandingkan penjualan dengan stok, memberi peringatan sebelum barang habis, dan menyiapkan draf pesanan ke pemasok.",
          },
          {
            title: "Laporan tutup toko yang sudah jadi",
            body: "Membaca penjualan hari itu dari sistem kasir atau spreadsheet Anda dan mengirim rekap per cabang kepada pemilik.",
          },
          {
            title: "Konten yang terus berjalan",
            body: "Postingan dan caption untuk seminggu disiapkan dari menu dan promo Anda, dalam bahasa Indonesia dan Inggris, tinggal Anda setujui.",
          },
          {
            title: "Faktur pemasok tanpa mengetik ulang",
            body: "Foto faktur menjadi satu baris di file pembelian Anda, lengkap dengan tanda jika harganya berubah.",
          },
        ],
        scenario:
          "Sebuah restoran di Jakarta Selatan dulu menjawab setiap reservasi secara manual di sela jam sibuk. Dengan asisten di nomor WhatsApp-nya, tamu mendapat konfirmasi meja dalam waktu kurang dari semenit, aturan ruang privat dijelaskan dengan cara yang sama setiap kali, dan manajer hanya turun tangan untuk acara besar.",
      },
      services: {
        name: "Klinik dan jasa profesional",
        short: "Klinik, agensi, properti, kantor hukum dan akuntan.",
        title: "AI untuk klinik, agensi, dan kantor jasa profesional",
        intro:
          "Yang Anda jual adalah waktu. Setiap jam untuk mengatur jadwal, mengirim pengingat, dan mengurus dokumen adalah jam yang tidak dipakai untuk pasien atau klien.",
        pains: [
          "Permintaan janji temu dan perubahan jadwal mengganggu meja depan sepanjang hari",
          "Pasien tidak datang karena tidak ada yang sempat mengirim pengingat",
          "Dokumen klien dikumpulkan satu per satu lewat chat",
          "Proposal, laporan, dan surat ditulis ulang dari nol setiap kali",
        ],
        solutions: [
          {
            title: "Janji temu dan pengingat",
            body: "Mencatat janji, mengubah jadwal, dan mengingatkan pasien atau klien lewat WhatsApp, serta meneruskan hal medis atau sensitif kepada staf Anda.",
          },
          {
            title: "Penerimaan klien dan pengumpulan dokumen",
            body: "Meminta dokumen yang tepat, mengecek apa yang masih kurang, dan mengarsipkan yang masuk, sehingga tim Anda mulai dengan berkas yang lengkap.",
          },
          {
            title: "Draf pertama dalam hitungan menit",
            body: "Proposal, surat perikatan, laporan, dan notulen rapat disusun dari template Anda sendiri, untuk diperiksa dan ditandatangani seorang profesional.",
          },
          {
            title: "Asisten pengetahuan internal",
            body: "Staf bertanya tentang prosedur, daftar harga, atau kasus terdahulu dan mendapat jawaban beserta sumbernya.",
          },
          {
            title: "Penagihan dan tindak lanjut",
            body: "Tagihan disiapkan dari pekerjaan yang selesai, dan pengingat yang sopan dikirim saat pembayaran terlambat.",
          },
        ],
        scenario:
          "Sebuah klinik gigi di Jakarta kehilangan beberapa janji temu setiap minggu karena pasien tidak datang. Asisten mengonfirmasi setiap janji sehari sebelumnya, menawarkan jadwal baru kepada pasien yang berhalangan, dan mengisi slot kosong dari daftar tunggu, sementara semua pertanyaan soal perawatan tetap dijawab staf klinik.",
      },
      trading: {
        name: "Perdagangan dan manufaktur",
        short: "Distributor, importir, bengkel, dan pabrik kecil.",
        title: "AI untuk distributor, importir, dan bengkel produksi",
        intro:
          "Pesanan masuk lewat chat, harga ada di spreadsheet, dan hanya pemilik yang tahu semuanya. Hambatan itulah yang kami hilangkan.",
        pains: [
          "Pertanyaan harga dan stok dijawab satu per satu oleh dua orang yang sama",
          "Penawaran makan waktu sehari karena daftar harganya ada di kepala seseorang",
          "Pesanan diketik ulang dari WhatsApp ke sistem, lalu terjadi salah input",
          "Piutang baru ditagih ketika kas mulai seret",
        ],
        solutions: [
          {
            title: "Jawaban harga dan stok di WhatsApp",
            body: "Pelanggan dan tim penjualan menanyakan harga, minimum pesanan, atau stok, lalu mendapat jawaban dari daftar Anda sendiri kapan saja.",
          },
          {
            title: "Penawaran dalam hitungan menit",
            body: "Permintaan lewat chat menjadi penawaran rapi lengkap dengan syarat Anda, siap diperiksa dan dikirim tenaga penjualan.",
          },
          {
            title: "Pesanan tanpa mengetik ulang",
            body: "Pesanan lewat chat, email, atau PDF dibaca dan dimasukkan ke lembar pesanan atau sistem Anda, dan baris yang kurang jelas ditandai untuk diperiksa.",
          },
          {
            title: "Tindak lanjut piutang",
            body: "Daftar mingguan tagihan yang jatuh tempo, dan pengingat kepada pelanggan dengan nada dan waktu yang tepat.",
          },
          {
            title: "Laporan dari lapangan",
            body: "Catatan produksi, pengiriman, dan mutu yang dikirim sebagai pesan suara menjadi laporan harian yang terstruktur.",
          },
        ],
        scenario:
          "Sebuah pemasok kemasan di Jakarta Timur menjawab puluhan permintaan harga setiap hari. Setelah daftar harga dan stoknya terhubung ke asisten, pemilik kafe mendapat penawaran di WhatsApp dalam semenit, dan tim penjualan bisa fokus pada pelanggan besar serta pesanan khusus.",
      },
    },
  },

  pricing: {
    metaTitle: "Harga",
    metaDescription:
      "Harga Lancar AI: konsultasi gratis 30 menit, audit di lokasi dengan harga tetap sesuai ukuran usaha dan dipotong dari biaya implementasi, lalu harga tetap per solusi.",
    title: "Harga",
    intro: "Anda selalu tahu harganya sebelum memutuskan melangkah ke tahap berikutnya.",
    call: { title: "Konsultasi awal", price: "Gratis", body: "30 menit lewat telepon, video, atau WhatsApp. Tanpa kewajiban." },
    audit: {
      title: "Audit di lokasi",
      credit: "Dipotong penuh dari biaya implementasi jika Anda melanjutkan.",
      tiers: {
        micro: { name: "Tim kecil", staff: "Hingga 10 karyawan", visit: "Kunjungan setengah hari" },
        small: { name: "Usaha berkembang", staff: "11 sampai 50 karyawan", visit: "Kunjungan satu hari" },
        medium: { name: "Perusahaan mapan", staff: "51 sampai 200 karyawan", visit: "Kunjungan dua hari" },
      },
      includesTitle: "Setiap audit mencakup",
      includes: [
        "Wawancara dengan pemilik dan staf yang mengerjakan tugas harian",
        "Laporan tertulis dalam bahasa Indonesia atau Inggris",
        "Daftar peluang berurutan prioritas dengan jam yang dihemat, biaya pemasangan, dan biaya operasional",
        "Perbaikan cepat tanpa biaya yang bisa langsung diterapkan tim Anda",
        "Penawaran harga tetap untuk solusi yang layak dibangun",
      ],
      cta: "Mulai dari konsultasi gratis",
    },
    implementation: {
      title: "Implementasi",
      price: "Harga tetap",
      body: "Setiap solusi di laporan audit disertai harga tetap. Anda memilih apa yang dibangun dan urutannya. Biaya audit dipotong dari tagihan implementasi pertama.",
    },
    accompaniment: {
      title: "Pendampingan bulanan",
      price: "Opsional",
      body: "Tinjauan rutin, penyesuaian, dan pelatihan staf setelah sistem berjalan. Harganya dicantumkan di proposal, sesuai tingkat dukungan yang Anda inginkan.",
    },
    notes: [
      "Harga dalam rupiah dan belum termasuk pajak yang berlaku.",
      "Kunjungan di Bali dan Jabodetabek sudah termasuk. Perjalanan ke lokasi lain dihitung terpisah.",
      "Langganan dan biaya pemakaian AI Anda bayar langsung ke penyedianya, dengan akun atas nama Anda. Perkiraannya kami cantumkan di laporan.",
      "Lebih dari 200 karyawan atau beberapa lokasi? Hubungi kami untuk proposal khusus.",
    ],
    faq: {
      title: "Pertanyaan seputar harga",
      items: [
        {
          q: "Kenapa auditnya tidak gratis?",
          a: "Audit yang serius membutuhkan waktu di lokasi dan beberapa hari analisis. Dengan memungut biaya, kami tetap independen: kami dibayar untuk memberi laporan yang jujur, bukan untuk menjual proyek. Dan jika Anda melanjutkan, biayanya dipotong dari implementasi.",
        },
        {
          q: "Bagaimana jika audit tidak menemukan apa pun yang layak dibangun?",
          a: "Maka laporan akan mengatakannya, dan menjelaskan apa yang perlu dibenahi lebih dulu. Anda tetap menerima peta proses dan perbaikan cepat tanpa biaya. Lebih baik kami menyampaikan itu daripada membangun sesuatu yang tidak Anda butuhkan.",
        },
        {
          q: "Bolehkah rekomendasinya saya kerjakan sendiri atau dengan pihak lain?",
          a: "Boleh. Laporannya milik Anda. Banyak perbaikan cepat sengaja ditulis agar tim Anda bisa menerapkannya tanpa kami.",
        },
        {
          q: "Bagaimana cara pembayarannya?",
          a: "Lewat transfer bank berdasarkan tagihan. Termin pembayaran tercantum di setiap penawaran.",
        },
      ],
    },
  },

  about: {
    metaTitle: "Tentang kami",
    metaDescription:
      "Lancar AI adalah konsultan AI yang datang langsung ke lokasi, untuk UMKM di Bali dan Jakarta. Kami berbahasa Indonesia dan Inggris.",
    title: "Tentang Lancar AI",
    lead: "Lancar: berjalan mulus, tanpa hambatan. Itulah yang diinginkan setiap pemilik dari usahanya, dan untuk itulah kami ada.",
    story: [
      "Perusahaan besar punya konsultan yang mempelajari proses mereka dan menghadirkan AI di tempat yang menguntungkan. Usaha kecil dan menengah biasanya hanya mendapat langganan software dan video tutorial. Padahal spa dengan delapan karyawan atau distributor dengan empat puluh karyawan kehilangan jam kerja yang sama banyaknya untuk pekerjaan berulang, dan merasakannya lebih berat.",
      "Lancar AI didirikan untuk menutup kesenjangan itu di Bali dan Jakarta. Kami konsultan yang datang ke lokasi, berbahasa Indonesia dan Inggris, dan mendampingi tim Anda sejak obrolan pertama sampai cara kerja baru terasa biasa.",
    ],
    principlesTitle: "Cara kami bersikap",
    principles: [
      {
        title: "Kami yang datang ke Anda",
        body: "Kami memahami usaha Anda dengan hadir di sana: di meja depan, di dapur, di gudang, di samping orang yang mengerjakannya.",
      },
      {
        title: "Bahasa yang mudah dipahami",
        body: "Tanpa istilah rumit. Laporan, pelatihan, dan dukungan tersedia dalam bahasa Indonesia atau Inggris, ditulis agar bisa dipakai seluruh tim.",
      },
      {
        title: "Rekomendasi yang jujur",
        body: "Kami tidak terikat pada penyedia AI atau vendor software mana pun. Jika alat gratis sudah cukup, atau jika AI bukan jawabannya, kami akan mengatakannya.",
      },
      {
        title: "Anda tetap memegang kendali",
        body: "Akun Anda, data Anda, keputusan Anda. Setiap asisten bisa menyerahkan percakapan ke manusia, dan tim Anda belajar cara menyesuaikannya.",
      },
    ],
    whereTitle: "Wilayah kerja kami",
    where: "Kunjungan langsung di seluruh Bali dan Jabodetabek. Wilayah lain di Indonesia sesuai permintaan.",
  },

  contact: {
    metaTitle: "Kontak",
    metaDescription: "Jadwalkan konsultasi gratis 30 menit dengan Lancar AI lewat WhatsApp atau formulir kontak.",
    title: "Mari bicarakan usaha Anda",
    intro:
      "Konsultasi pertama gratis dan berlangsung 30 menit. Tulis pesan lewat WhatsApp, atau tinggalkan data Anda dan kami akan menelepon atau mengirim pesan kepada Anda.",
    whatsappTitle: "Paling cepat: WhatsApp",
    whatsappBody: "Kirim pesan dan ceritakan jenis usaha yang Anda jalankan.",
    emailTitle: "Email",
    formTitle: "Atau tinggalkan data Anda",
  },

  form: {
    name: "Nama Anda",
    business: "Nama usaha",
    whatsapp: "Nomor WhatsApp",
    whatsappHint: "Dengan kode negara, misalnya +62 812 3456 7890",
    email: "Email (opsional)",
    location: "Di mana lokasi usaha Anda?",
    locations: { bali: "Bali", jakarta: "Jakarta dan sekitarnya", other: "Wilayah lain di Indonesia" },
    sector: "Jenis usaha",
    sectors: {
      hospitality: "Perhotelan dan spa",
      food: "Restoran, kafe, atau retail",
      services: "Klinik atau jasa profesional",
      trading: "Perdagangan atau manufaktur",
      other: "Lainnya",
    },
    team: "Jumlah karyawan",
    teams: { micro: "Hingga 10 karyawan", small: "11 sampai 50 karyawan", medium: "51 sampai 200 karyawan" },
    message: "Apa yang paling menyita waktu tim Anda? (opsional)",
    consent: "Saya setuju Lancar AI menghubungi saya terkait permintaan ini dan mengelola data saya sesuai",
    consentLink: "kebijakan privasi",
    submit: "Kirim",
    sending: "Mengirim",
    choose: "Pilih",
    successTitle: "Terima kasih, data Anda sudah kami terima",
    successBody: "Kami akan menghubungi Anda lewat WhatsApp untuk mengatur jadwal konsultasi.",
    errorInvalid: "Mohon periksa kolom yang ditandai.",
    errorServer: "Pesan Anda tidak dapat kami simpan. Silakan hubungi kami lewat WhatsApp atau email.",
    errorRate: "Terlalu banyak percobaan. Silakan coba lagi beberapa menit lagi.",
    required: "Kolom ini wajib diisi.",
    invalidWhatsapp: "Masukkan nomor telepon beserta kode negaranya.",
    invalidEmail: "Masukkan alamat email yang valid.",
    consentRequired: "Mohon centang kotak ini agar kami dapat menghubungi Anda.",
  },

  quiz: {
    metaTitle: "Kuis kesiapan AI",
    metaDescription:
      "Sepuluh pertanyaan, dua menit: ketahui seberapa besar AI bisa membantu usaha Anda dan seberapa siap Anda memakainya.",
    title: "Seberapa siap usaha Anda memakai AI?",
    intro:
      "Sepuluh pertanyaan, sekitar dua menit. Anda mendapat dua skor dan tiga ide konkret untuk usaha Anda. Hasilnya langsung terlihat tanpa perlu email.",
    progress: "Pertanyaan {n} dari {total}",
    back: "Kembali",
    next: "Lanjut",
    seeResult: "Lihat hasil saya",
    multiHint: "Pilih semua yang sesuai, atau tidak sama sekali.",
    restart: "Ulangi dari awal",
    questions: {
      sector: {
        q: "Apa jenis usaha Anda?",
        options: {
          hospitality: "Perhotelan atau spa (vila, hotel, spa, tur)",
          food: "Restoran, kafe, atau retail",
          services: "Klinik atau jasa profesional",
          trading: "Perdagangan atau manufaktur",
          other: "Lainnya",
        },
      },
      team: {
        q: "Berapa orang yang bekerja di usaha Anda?",
        options: { micro: "1 sampai 10", small: "11 sampai 50", medium: "51 sampai 200" },
      },
      channel: {
        q: "Lewat mana sebagian besar pelanggan menghubungi Anda?",
        options: {
          whatsapp: "WhatsApp",
          social: "Instagram atau media sosial lain",
          phone: "Telepon",
          platform: "Platform booking atau marketplace",
          walkin: "Datang langsung",
        },
      },
      volume: {
        q: "Berapa banyak pesan dan pertanyaan yang masuk pada hari biasa?",
        options: { lt10: "Kurang dari 10", "10to50": "10 sampai 50", "50to200": "50 sampai 200", gt200: "Lebih dari 200" },
      },
      afterHours: {
        q: "Pelanggan mengirim pesan setelah jam tutup. Kapan ia mendapat balasan?",
        options: { minutes: "Dalam beberapa menit", hours: "Beberapa jam kemudian", nextDay: "Keesokan harinya" },
      },
      languages: {
        q: "Bahasa apa yang dipakai pelanggan Anda?",
        options: { one: "Hanya bahasa Indonesia", two: "Indonesia dan Inggris", many: "Tiga bahasa atau lebih" },
      },
      tasks: {
        q: "Tugas mana yang terlalu banyak menyita waktu tim Anda?",
        options: {
          faq: "Menjawab pertanyaan yang sama berulang kali",
          booking: "Mencatat dan mengubah booking atau pesanan",
          invoices: "Tagihan dan menagih pembayaran",
          reports: "Rekap dan laporan harian",
          content: "Konten media sosial dan pemasaran",
          stock: "Stok dan pembelian",
          hr: "Jadwal karyawan dan administrasi SDM",
        },
      },
      data: {
        q: "Di mana daftar harga, booking, dan catatan penjualan Anda disimpan?",
        options: {
          paper: "Sebagian besar di kertas atau di ingatan",
          sheets: "Di Excel atau Google Sheets",
          software: "Di software khusus (kasir, sistem booking, akuntansi)",
          mixed: "Campuran semuanya",
        },
      },
      aiUse: {
        q: "Apakah tim Anda pernah memakai alat AI seperti ChatGPT atau Claude?",
        options: {
          never: "Belum pernah",
          personal: "Sebagian, untuk keperluan pribadi",
          work: "Ya, dalam pekerjaan sehari-hari",
        },
      },
      owner: {
        q: "Siapa yang akan memimpin perubahan seperti ini di usaha Anda?",
        options: {
          owner: "Pemilik",
          manager: "Manajer yang kami percaya",
          nobody: "Belum ada",
        },
      },
    },
    result: {
      title: "Hasil Anda",
      opportunity: "Peluang",
      opportunityHint: "Seberapa banyak pekerjaan berulang yang bisa diambil alih AI",
      readiness: "Kesiapan",
      readinessHint: "Seberapa mudah usaha Anda menerapkannya saat ini",
      profiles: {
        ready: {
          title: "Siap menerapkan",
          body: "Pekerjaan berulang Anda banyak, dan fondasi untuk mengotomatiskannya sudah ada. Audit yang terarah seharusnya menemukan solusi yang cepat balik modal.",
        },
        foundations: {
          title: "Peluang besar, benahi fondasi dulu",
          body: "Banyak yang bisa diraih, tetapi beberapa hal dasar perlu dibenahi lebih dulu: di mana informasi disimpan dan siapa yang memimpin perubahan. Itulah yang dibereskan lewat audit.",
        },
        tune: {
          title: "Sudah rapi, tinggal disempurnakan",
          body: "Usaha Anda sudah tertata. AI akan membantu pada tugas-tugas tertentu, bukan mengubah semuanya. Mulailah dari satu perbaikan cepat yang dipilih dengan cermat.",
        },
        start: {
          title: "Mulai dari yang kecil",
          body: "Volumenya masih kecil dan hal dasarnya belum siap. Mulailah dengan alat gratis dan kebiasaan sederhana. Kami dengan senang hati menunjukkannya lewat konsultasi.",
        },
      },
      recsTitle: "Tiga ide untuk usaha Anda",
      recs: {
        digitize: {
          title: "Kumpulkan informasi penting di satu tempat",
          body: "Harga, layanan, dan ketersediaan dalam satu file bersama. Inilah dasar yang dibutuhkan setiap asisten, dan langsung membantu staf Anda sejak hari pertama.",
        },
        training: {
          title: "Sesi singkat AI untuk tim Anda",
          body: "Dua jam praktik langsung memakai alat AI untuk tugas dari usaha Anda sendiri menghilangkan sebagian besar keraguan dan memunculkan ide-ide terbaik.",
        },
        autoReply: {
          title: "Asisten untuk pesan pelanggan",
          body: "Jawaban cepat untuk pertanyaan yang Anda terima setiap hari, dari informasi Anda sendiri, dan diteruskan ke staf bila diperlukan.",
        },
        multilingual: {
          title: "Balasan dalam bahasa pelanggan Anda",
          body: "Asisten yang sama menjawab dalam bahasa Mandarin, Korea, Rusia, atau Prancis, lalu merangkum percakapannya untuk tim dalam bahasa Indonesia.",
        },
        booking: {
          title: "Booking dan pesanan tercatat otomatis",
          body: "Dari pesan pertama sampai jadwal atau pesanan terkonfirmasi, tercatat di kalender atau spreadsheet Anda, lengkap dengan pengingat untuk pelanggan.",
        },
        invoices: {
          title: "Tagihan dan pengingat pembayaran",
          body: "Tagihan disiapkan dari pekerjaan yang selesai dan pengingat yang sopan dikirim sesuai jadwal, sehingga tidak ada yang terlewat.",
        },
        reports: {
          title: "Rekap harian di WhatsApp Anda",
          body: "Penjualan, booking, dan masalah yang belum selesai dirangkum setiap pagi dari file yang sudah Anda miliki.",
        },
        content: {
          title: "Konten seminggu dalam satu jam",
          body: "Postingan dan caption disusun dengan gaya Anda dari menu, layanan, dan promo, tinggal Anda setujui.",
        },
        stock: {
          title: "Peringatan stok dan draf pesanan",
          body: "Peringatan sebelum barang habis, dengan pesanan ke pemasok yang sudah disiapkan.",
        },
        hr: {
          title: "Jadwal dan pertanyaan staf",
          body: "Jadwal shift disusun dari aturan Anda, dan asisten yang menjawab pertanyaan staf tentang prosedur.",
        },
      },
      tierTitle: "Audit untuk ukuran usaha Anda",
      tierBody: "{name}: {price}, dipotong dari biaya implementasi jika Anda melanjutkan.",
      leadTitle: "Ingin membahasnya bersama kami?",
      leadBody: "Tinggalkan data Anda dan kami akan menghubungi Anda untuk membahas hasil ini. Konsultasi pertama gratis.",
      whatsappCta: "Kirim hasil saya lewat WhatsApp",
      whatsappText: "Halo Lancar AI, saya sudah mengikuti kuis kesiapan. Peluang: {opportunity}/100, kesiapan: {readiness}/100. Saya ingin menjadwalkan konsultasi gratis.",
    },
  },

  demo: {
    metaTitle: "Demo asisten AI langsung",
    metaDescription:
      "Chat dengan asisten AI sebuah spa, restoran, klinik, atau pemasok fiktif. Tulis dalam bahasa apa pun dan coba lakukan booking.",
    title: "Ngobrol dengan asisten AI langsung",
    intro:
      "Keempat usaha ini fiktif. Asistennya nyata: ia berjalan di Claude dan hanya menjawab dari lembar fakta usaha tersebut, sama seperti yang kami pasang untuk klien. Tulis dalam bahasa apa pun.",
    choose: "Pilih usaha",
    personas: {
      spa: { name: "Spa Embun Pagi", place: "Ubud, Bali", kind: "Spa harian" },
      restaurant: { name: "Dapur Kunyit", place: "Jakarta Selatan", kind: "Restoran masakan Indonesia" },
      clinic: { name: "Klinik Gigi Senyum Cerah", place: "Jakarta Utara", kind: "Klinik gigi" },
      supplier: { name: "Kemasan Nusa Jaya", place: "Jakarta Timur", kind: "Pemasok kemasan" },
    },
    greeting: "Halo! Saya asisten AI {name}. Ada yang bisa saya bantu hari ini?",
    suggestionsLabel: "Coba tanyakan",
    placeholder: "Tulis pesan dalam bahasa apa pun",
    send: "Kirim",
    typing: "Mengetik",
    reset: "Percakapan baru",
    factSheet: "Lihat semua yang diketahui asisten",
    factSheetNote: "Lembar fakta (dalam bahasa Inggris) ini adalah satu-satunya bekal asisten. Untuk klien, isinya berasal dari audit.",
    disclaimer:
      "Hanya demonstrasi: tidak ada booking yang benar-benar tercatat. Mohon jangan memasukkan data pribadi atau data pembayaran. Pesan dikirim ke penyedia AI kami untuk menghasilkan balasan.",
    offline: "Demo langsung sedang dinonaktifkan. Berikut contoh rekaman percakapan dari asisten yang sama.",
    limit: "Anda sudah mencapai batas demo ini. Terima kasih sudah mencoba! Hubungi kami untuk melihat lebih banyak.",
    tooLong: "Percakapan ini sudah mencapai panjang maksimum. Mulai percakapan baru untuk melanjutkan.",
    error: "Terjadi kesalahan. Silakan coba lagi.",
    ctaTitle: "Ingin asisten seperti ini untuk usaha Anda?",
    ctaBody: "Asisten seperti ini adalah salah satu solusi yang kami pasang setelah audit di lokasi, dengan harga, ketersediaan, dan aturan Anda yang sebenarnya.",
  },

  blog: {
    metaTitle: "Blog",
    metaDescription: "Artikel praktis tentang pemanfaatan AI untuk usaha kecil dan menengah di Indonesia.",
    title: "Blog",
    intro: "Catatan praktis tentang AI untuk usaha kecil dan menengah. Tanpa janji berlebihan.",
    readMore: "Baca artikel",
    back: "Semua artikel",
    published: "Terbit",
    minutes: "{n} menit baca",
    ctaTitle: "Ingin tahu mana yang cocok untuk usaha Anda?",
  },

  privacy: {
    metaTitle: "Kebijakan privasi",
    metaDescription: "Cara Lancar AI mengelola data pribadi yang Anda berikan di situs ini.",
    title: "Kebijakan privasi",
    updated: "Terakhir diperbarui: 17 November 2026",
    sections: [
      {
        title: "Siapa kami",
        body: [
          "Situs ini dikelola oleh Lancar AI, konsultan AI untuk usaha kecil dan menengah di Bali dan Jakarta. Untuk pertanyaan apa pun mengenai data pribadi Anda, hubungi kami melalui kontak yang tercantum di halaman kontak.",
        ],
      },
      {
        title: "Data yang kami kumpulkan",
        body: [
          "Formulir kontak dan kuis: nama, nama usaha, nomor WhatsApp, alamat email jika Anda mengisinya, lokasi, jenis usaha, jumlah karyawan, pesan Anda, dan jawaban kuis Anda.",
          "Demo langsung: pesan yang Anda ketik di chat demo. Mohon jangan memasukkan data pribadi atau data pembayaran di sana.",
          "Data teknis: alamat IP Anda digunakan sesaat untuk mencegah penyalahgunaan formulir dan demo.",
        ],
      },
      {
        title: "Tujuan penggunaan",
        body: [
          "Data Anda hanya kami gunakan untuk menjawab permintaan Anda, mengatur jadwal konsultasi, dan menyiapkan proposal jika Anda memintanya. Kami tidak menjual data Anda dan tidak mengirim pesan pemasaran tanpa persetujuan Anda.",
        ],
      },
      {
        title: "Pihak yang memproses data",
        body: [
          "Data Anda disimpan di penyedia hosting dan basis data kami dan, untuk notifikasi, melewati penyedia email kami. Pesan di chat demo dikirim ke Anthropic, penyedia model AI Claude, untuk menghasilkan balasan. Para penyedia ini bertindak atas instruksi kami dan dapat memproses data di luar Indonesia.",
        ],
      },
      {
        title: "Lama penyimpanan",
        body: [
          "Permintaan Anda disimpan selama kami masih berhubungan dengan Anda dan paling lama dua tahun setelahnya, kecuali Anda meminta penghapusan lebih awal. Pesan di chat demo tidak disimpan oleh situs ini.",
        ],
      },
      {
        title: "Hak Anda",
        body: [
          "Berdasarkan Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022), Anda berhak meminta akses, perbaikan, atau penghapusan data pribadi Anda, serta menarik persetujuan kapan saja. Tulis kepada kami dan kami akan menindaklanjuti permintaan Anda.",
        ],
      },
    ],
  },

  notFound: {
    title: "Halaman tidak ditemukan",
    body: "Halaman yang Anda cari tidak ada atau sudah dipindahkan.",
    cta: "Kembali ke beranda",
  },
};
