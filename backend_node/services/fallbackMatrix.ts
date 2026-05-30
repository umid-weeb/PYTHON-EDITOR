export type RemediationPayload = {
  concept_explanation: string;
  youtube_embed_id: string;
  quiz: Array<{
    question: string;
    options: string[];
    correct_answer_index: number;
  }>;
};

const matrix: Record<string, RemediationPayload> = {
  binary_search: {
    concept_explanation: "Binary qidiruv - bu saralangan ro'yxatda elementni logarifmik vaqt ichida topish usuli. Tasavvur qiling: siz kitoblarni alfavit tartibida qidiryapsiz va har safar o'rtadagi kitobni tekshirib, chap yoki o'ng bo'limga o'tasiz...",
    youtube_embed_id: "v4mC_d6Kq9o",
    quiz: [
      {
        question: "Binary search qachon ishlaydi?",
        options: ["Ro'yxat saralangan bo'lsa","Ro'yxat tartibsiz bo'lsa","Faqat bitta element bo'lsa","Hech qachon"],
        correct_answer_index: 0,
      },
    ],
  },
  trees: {
    concept_explanation: "Daraxtlar — tugunlar va qirralardan tashkil topgan ma'lumotlar tuzilishi. Root, leaf va balans kabi atamalarni o'rganing...",
    youtube_embed_id: "A1b2C3d4E5f",
    quiz: [
      {
        question: "Binary tree ning leaf tuguni nima?",
        options: ["Bolalari yo'q tugun","Faqat bitta bola bor tugun","Ikkita bola bor tugun","Root tugun"],
        correct_answer_index: 0,
      },
    ],
  },
  linked_list: {
    concept_explanation: "Linked list - har bir tugun keyingi tugunni ko'rsatadigan dinamik tuzilma. Ular oson insert va remove qilinadi, lekin tasodifiy o'qish qiyinroq...",
    youtube_embed_id: "L1nK3dQ9rT0",
    quiz: [
      {
        question: "Singly linked listda elementni o'chirish qanday amalga oshadi?",
        options: ["Oldingi tugunning pointerini o'zgartirish","Elementni indeks bilan chiqarish","Massivni qayta saralash","Imkoniyatsiz"],
        correct_answer_index: 0,
      },
    ],
  },
  bfs: {
    concept_explanation: "BFS (breadth-first search) darajalar bo'yicha (level-order) grafni yoki daraxtni kezadi. U navbat (queue) yordamida amalga oshiriladi...",
    youtube_embed_id: "bFsV9kLmQ8p",
    quiz: [
      {
        question: "BFS qaysi ma'lumot tuzilmadan foydalanadi?",
        options: ["Queue","Stack","Hashmap","Tree"],
        correct_answer_index: 0,
      },
    ],
  },
  dfs: {
    concept_explanation: "DFS (depth-first search) chuqurlik tomon qarab grafni kezadi, odatda stack yoki rekursiya ishlatiladi...",
    youtube_embed_id: "dFsX7nP3kL1",
    quiz: [
      {
        question: "DFS nimaga o'xshash tuzilma bilan ishlaydi?",
        options: ["Stack","Queue","Heap","Map"],
        correct_answer_index: 0,
      },
    ],
  },
};

export default matrix;
