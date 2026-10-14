# MODEL-002 — letters written by local models (synthetic profiles)

Generated 2026-10-14 by `npm run eval:local-llm -- --transport=llama-server --task=letters`:
llama.cpp b11457 (CUDA 13.4) on the RTX 5060 Laptop, greedy decoding, the shipped letter
prompt (`src/server/letters/prompt.ts`) and the shipped validator. The profiles and jobs
are synthetic golden-set data; no real person is described. The prompt gives the model
only the target roles, the country and a 500-character job excerpt: it never sees the
profile's confirmed skills or any experience.

Annotations under each letter compare what the letter claims with the profile's
confirmed skills (`src/data/matching-golden.ts`). They are the implementer's reading for
the owner's review, not the owner's verdict.

## Model 1: Qwen3-VL-8B-Instruct (Q4_K_M)

**The owner's marks (2026-10-14): all six usable as drafts.**

Profiles: p-ru-ml (KZ; Python, NLP, Deep Learning, Machine Learning, Data Science, SQL);
p-backend-eu (DE; Node.js, TypeScript, PostgreSQL, Docker, REST API, Redis);
p-frontend-latam (BR; React, TypeScript, JavaScript, HTML/CSS, Tailwind CSS, Redux).

### p-ru-ml → golden-j10 (grade 3): Machine Learning Engineer (NLP) at Cortexa
validator passed · 139 words · en · json true · 4.3s · 49.6 tok/s
Dear Hiring Team at Cortexa,

I am writing to express my interest in the Machine Learning Engineer (NLP) position. With a strong foundation in NLP and machine learning, I am proficient in building and deploying models using Python, PyTorch, and the Hugging Face Transformers library. My experience aligns closely with your requirements, particularly in developing deep learning architectures for natural language tasks.

I have successfully designed and trained NLP models for classification, sequence generation, and text understanding, leveraging modern frameworks and best practices. I prioritize clean, maintainable code and collaborative workflows, which I believe are essential for scalable ML systems.

I am eager to contribute to Cortexa’s mission by applying my technical skills to real-world NLP challenges. I welcome the opportunity to discuss how my background can support your team’s goals.

Thank you for your consideration.

Sincerely,
[Your Name]

*Reading:* claims PyTorch and Hugging Face Transformers (not in the profile, taken from the job) and having "designed and trained NLP models for classification, sequence generation" (no experience is in the profile). English for a Russian-first candidate.

### p-ru-ml → golden-j11 (grade 3): Data Scientist at Quantiva
validator passed · 151 words · en · json true · 4.1s · 49.9 tok/s
Dear Hiring Team,

I am writing to express my interest in the Data Scientist position at Quantiva, as advertised. With a strong foundation in Python and SQL, I am well-equipped to contribute to product experimentation and analytics through data science and machine learning. My experience aligns with the technical requirements of the role, enabling me to support data-driven decision-making and model development.

I am particularly drawn to Quantiva’s focus on leveraging data science to enhance product performance. My background includes designing and implementing analytical solutions that extract actionable insights from structured and unstructured data. I am proficient in applying machine learning techniques to real-world problems and committed to maintaining clean, reproducible code.

I welcome the opportunity to bring my technical skills and analytical mindset to your team. I am eager to learn from your experts and contribute meaningfully to your product experimentation initiatives.

Thank you for your consideration.

Sincerely,
[Your Name]

*Reading:* the skills named are in the profile; "designing and implementing analytical solutions" and "structured and unstructured data" are invented experience. English.

### p-backend-eu → golden-j01 (grade 3): Senior Node.js Engineer at Nordwind Labs
validator passed · 151 words · en · json true · 4.2s · 48 tok/s
Dear Hiring Team at Nordwind Labs,

I am writing to express my interest in the Senior Node.js Engineer position. With a strong background in building scalable backend services using Node.js and TypeScript, I am confident in my ability to contribute effectively to your payment platform infrastructure.

My experience includes developing REST API layers, integrating with PostgreSQL and Redis, and deploying services using Docker. I prioritize clean, maintainable code and robust system design — qualities I understand are critical for your platform’s reliability and performance.

I am particularly drawn to Nordwind Labs’ focus on modern, high-performance systems and appreciate the opportunity to work with technologies I am deeply familiar with. I value collaboration and continuous improvement, and I am eager to bring my technical expertise to your team.

Thank you for considering my application. I look forward to the possibility of discussing how my skills align with your needs.

Sincerely,
[Your Name]

*Reading:* every skill named is in the profile (the job asks for exactly them; the prompt never passed the skills); "developing REST API layers… deploying services using Docker" is invented experience.

### p-backend-eu → golden-j20 (grade 3): Разработчик Node.js (удалённо) at Цифровой Контур
validator passed · 142 words · en · json true · 4.5s · 45.4 tok/s
Dear Hiring Team,

I am writing to express my interest in the Node.js Developer position at Цифровой Контур, as advertised. With a strong foundation in backend development, I am proficient in Node.js, TypeScript, PostgreSQL, Docker, and REST API design — the core technologies required for this role.

My experience includes building scalable backend services using modern JavaScript frameworks and containerizing applications with Docker for consistent deployment. I prioritize clean, maintainable code and adhere to industry best practices in API design and database interaction.

I am comfortable working remotely and thrive in collaborative, goal-oriented environments. I appreciate Цифровой Контур’s focus on digital innovation and am eager to contribute to your technical stack while learning from your team.

Thank you for considering my application. I look forward to the opportunity to discuss how my skills align with your project needs.

Sincerely,
[Your Full Name]

*Reading:* the job is in Russian, the letter in English, and it renames the role "Node.js Developer"; skills match the profile; "I am comfortable working remotely" is not profile-confirmed.

### p-frontend-latam → golden-j06 (grade 3): Senior Frontend Engineer (React) at Lumen Studio
validator passed · 136 words · en · json true · 4.3s · 45.3 tok/s
Dear Hiring Team at Lumen Studio,

I am writing to express my interest in the Senior Frontend Engineer (React) position. With a strong foundation in React, TypeScript, and Redux, I am confident in my ability to contribute to your design system and product interface development. My experience includes building scalable UIs with clean HTML/CSS layouts and integrating GraphQL for efficient data layer management.

I value collaboration and maintainability, and I prioritize writing reusable, well-documented components that align with evolving design systems. I am comfortable working within modern frontend toolchains and am eager to support your product vision through thoughtful, user-centered interfaces.

I am particularly drawn to Lumen Studio’s focus on delivering polished, performant experiences, and I look forward to the opportunity to contribute to your team’s success.

Thank you for your consideration.

Sincerely,
[Your Full Name]

*Reading:* claims GraphQL (not in the profile) and building a design system's components (invented experience).

### p-frontend-latam → golden-j39 (grade 3): Senior React Developer at Northline Studio
validator passed · 137 words · en · json true · 4.5s · 43.5 tok/s
Dear Hiring Team at Northline Studio,

I am writing to express my interest in the Senior React Developer position. With a strong foundation in React, TypeScript, and Redux, I bring focused experience in building scalable, user-centric product interfaces. My proficiency in HTML/CSS ensures clean, responsive layouts, while my familiarity with GraphQL enables efficient data layer integration.

I value collaborative development environments and take pride in writing maintainable, testable code that aligns with evolving product needs. My technical approach prioritizes performance, accessibility, and consistency — qualities I understand are critical to Northline Studio’s projects.

I am eager to contribute to your team’s success by delivering polished, functional interfaces that enhance user experience. I welcome the opportunity to discuss how my skills can support your current and future product goals.

Thank you for your consideration.

Sincerely,
[Your Full Name]

*Reading:* claims GraphQL (not in the profile) and "accessibility" and testable code as practice (invented).

## Model 2: Qwen3-8B (Q4_K_M, thinking off)

The same profiles and jobs.

### p-ru-ml → golden-j10 (grade 3): Machine Learning Engineer (NLP) at Cortexa
validator passed · 173 words · en · json true · 5s · 45.9 tok/s
Dear Hiring Team,

I am writing to express my interest in the Machine Learning Engineer (NLP) position at Cortexa. With a strong foundation in machine learning and natural language processing, I am eager to contribute to your team’s mission of developing innovative AI solutions.

My experience includes designing and implementing NLP and machine learning models using Python, with a focus on deep learning frameworks such as PyTorch and the Hugging Face Transformers library. I have worked on tasks including text classification, sentiment analysis, and sequence modeling, which align closely with the requirements of this role.

I am particularly drawn to Cortexa’s commitment to advancing AI technologies and am confident that my technical background and problem-solving skills would be a valuable addition to your team. I am excited about the opportunity to collaborate on impactful projects and contribute to the development of cutting-edge NLP solutions.

Thank you for considering my application. I look forward to the possibility of discussing how my skills and experience align with the goals of Cortexa.

Sincerely,
[Your Full Name]

*Reading:* claims PyTorch and Hugging Face Transformers (not in the profile) and work on "text classification, sentiment analysis, and sequence modeling" (invented). English.

### p-ru-ml → golden-j11 (grade 3): Data Scientist at Quantiva
validator passed · 163 words · en · json true · 4.6s · 46.5 tok/s
Dear Hiring Team,

I am writing to express my interest in the Data Scientist position at Quantiva. With a strong foundation in data analysis, machine learning, and product experimentation, I am eager to contribute to your team’s mission of leveraging data-driven insights for business growth.

My experience includes applying Python and SQL to extract meaningful patterns from large datasets, as well as developing machine learning models to support analytics initiatives. I am particularly interested in how data science can drive product experimentation and improve user engagement, aligning closely with the requirements of this role.

I am confident in my ability to work collaboratively in a dynamic environment, and I am excited about the opportunity to bring my technical skills and analytical mindset to Quantiva. I would welcome the chance to discuss how my background and aspirations align with your team’s goals.

Thank you for considering my application. I look forward to the possibility of contributing to your organization’s success.

Sincerely,
[Your Full Name]

*Reading:* claims a foundation in "product experimentation" (from the job, not the profile) and work on "large datasets" (invented). English.

### p-backend-eu → golden-j01 (grade 3): Senior Node.js Engineer at Nordwind Labs
validator passed · 162 words · en · json true · 4.6s · 46.7 tok/s
Dear Hiring Team,

I am writing to express my interest in the Senior Node.js Engineer position at Nordwind Labs. With a strong background in backend development and extensive experience working with Node.js, TypeScript, PostgreSQL, Docker, and Redis, I am confident in my ability to contribute effectively to your team.

My professional experience has focused on building and maintaining scalable payment platform services, with a particular emphasis on designing and implementing REST API layers. I have consistently worked in environments that require robust, high-performance systems, and I am adept at leveraging modern development practices to ensure reliability and efficiency.

I am particularly drawn to Nordwind Labs' commitment to innovation and quality in payment solutions. I am eager to bring my technical expertise and problem-solving skills to a dynamic team that values both craftsmanship and collaboration.

Thank you for considering my application. I look forward to the opportunity to discuss how my background aligns with the goals of your team.

Sincerely,
[Your Full Name]

*Reading:* skills match the profile, but "extensive experience" and "My professional experience has focused on building and maintaining scalable payment platform services" are invented from the job's domain.

### p-backend-eu → golden-j20 (grade 3): Разработчик Node.js (удалённо) at Цифровой Контур
validator passed · 162 words · en · json true · 4.9s · 45.2 tok/s
Dear Hiring Manager,

I am writing to express my interest in the Remote Node.js Developer position at Цифровой Контур. With a strong foundation in backend development and experience working with Node.js, TypeScript, PostgreSQL, Docker, and REST API technologies, I am confident in my ability to contribute effectively to your team.

Throughout my career, I have focused on building scalable and maintainable web services, leveraging modern development practices to ensure high performance and reliability. My experience aligns closely with the requirements of the role, particularly in developing robust backend solutions using the technologies mentioned in the job description.

I am particularly drawn to Цифровой Контур’s commitment to innovation and quality in software development. I am eager to bring my technical expertise and dedication to a remote work environment that values collaboration and professional growth.

Thank you for considering my application. I look forward to the opportunity to discuss how my skills and experience can contribute to your team’s success.

Sincerely,
[Your Full Name]

*Reading:* the job is in Russian, the letter in English; "Throughout my career…" is invented; skills match the profile.

### p-frontend-latam → golden-j06 (grade 3): Senior Frontend Engineer (React) at Lumen Studio
validator passed · 177 words · en · json true · 5.1s · 45 tok/s
Dear Hiring Team,

I am writing to express my interest in the Senior Frontend Engineer (React) position at Lumen Studio. With a strong background in building scalable and user-centric web applications using React, TypeScript, and Redux, I am confident in my ability to contribute effectively to your team.

My experience includes designing and implementing robust UI components, leveraging HTML/CSS for layout, and integrating GraphQL for efficient data fetching. I have a solid understanding of modern frontend development practices and am committed to maintaining high code quality and consistency through the use of design systems.

I am particularly drawn to Lumen Studio’s focus on creating intuitive and visually appealing interfaces, and I am eager to bring my technical expertise and passion for frontend development to your projects. I am excited about the opportunity to collaborate with a talented team and contribute to innovative solutions that drive user engagement and business success.

Thank you for considering my application. I look forward to the possibility of discussing how my skills align with the needs of Lumen Studio.

Sincerely,
[Your Name]

*Reading:* claims GraphQL (not in the profile) and design-system work (invented).

### p-frontend-latam → golden-j39 (grade 3): Senior React Developer at Northline Studio
validator passed · 158 words · en · json true · 4.8s · 44 tok/s
Dear Hiring Team,

I am writing to express my interest in the Senior React Developer position at Northline Studio. With a strong background in frontend development, I have extensive experience building scalable and maintainable product interfaces using React, TypeScript, and Redux. My expertise also includes creating clean and responsive HTML/CSS layouts, as well as integrating GraphQL data layers to enhance application performance and data flow.

Throughout my career, I have consistently focused on delivering high-quality, user-centric solutions that align with business objectives. I am particularly drawn to Northline Studio’s commitment to innovation and excellence in product development, and I am eager to contribute my technical skills and passion for frontend development to your team.

I am confident that my experience and technical proficiency make me a strong candidate for this role. I would welcome the opportunity to discuss how my background aligns with the needs of Northline Studio. Thank you for considering my application.

Sincerely,
[Your Full Name]

*Reading:* claims "extensive experience" and GraphQL (not in the profile); "Throughout my career…" is invented.
