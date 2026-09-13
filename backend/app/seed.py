"""Seed SQLite with FHSU's real college/department/program structure at scale.

Colleges, departments/schools, and programs (degree name + type) are sourced
from catalog.fhsu.edu's per-college "Programs" tab (Bachelors/Masters/Minors/
Associates/Education Specialist/Doctor of Nursing Practice; certificates
excluded). Each department hosts one "flagship" program that gets richly
generated demo courses/modules/outcomes so the graph has hundreds of courses
to navigate; every other real catalog program is seeded as structure only
(no generated courses yet). Refine generated course content against the real
catalog later.

Deliberately seeded report fodder (in Applied Business Studies):
  - CLO orphan (MGT 400 CLO with no parent PLO)  -> orphan report
  - PLO4 with no course mappings                 -> dead-end report
"""
from sqlmodel import Session, select

from .auth import hash_password
from .database import engine, init_db
from .models import (Activity, ActivityType, Course, Mapping, MasteryLevel,
                     Node, NodeType, Outcome, OutcomeLevel, Resource, Role, User)

LA, AS = ActivityType.learning_activity, ActivityType.assessment
I, R, M = MasteryLevel.introduced, MasteryLevel.reinforced, MasteryLevel.mastered

# Real FHSU college/department/program structure sourced from catalog.fhsu.edu
# (each college's "Programs" tab: Bachelors/Masters/Minors/Associates/etc.,
# certificates excluded). college -> {department: [(program_name, degree_type), ...]}
FHSU_STRUCTURE = {
    "College of Arts, Humanities, and Social Sciences": {
        "School of Visual and Performing Arts": [
            ("Art (Art History, B.A.)", "Bachelor of Arts"),
            ("Art (Education, B.A.)", "Bachelor of Arts"),
            ("Art (Studio Art)", "Bachelor of Arts"),
            ("Art (Community Engaged Art, B.F.A.)", "Bachelor of Fine Arts"),
            ("Art (Education, B.F.A.)", "Bachelor of Fine Arts"),
            ("Art (Graphic Design, B.F.A.)", "Bachelor of Fine Arts"),
            ("Art (Interior Design)", "Bachelor of Fine Arts"),
            ("Art (Motion Design and Animation)", "Bachelor of Fine Arts"),
            ("Art (Photography, B.F.A.)", "Bachelor of Fine Arts"),
            ("Art (Studio Art: Ceramics)", "Bachelor of Fine Arts"),
            ("Art (Studio Art: Drawing-Painting)", "Bachelor of Fine Arts"),
            ("Art (Studio Art: Printmaking)", "Bachelor of Fine Arts"),
            ("Art (Studio Art: Sculpture)", "Bachelor of Fine Arts"),
            ("Music (B.A.)", "Bachelor of Arts"),
            ("Music (Composition)", "Bachelor of Music"),
            ("Music (Education)", "Bachelor of Music"),
            ("Music (Performance)", "Bachelor of Music"),
            ("Art (Ceramic)", "Master of Fine Arts"),
            ("Art (Drawing and Painting)", "Master of Fine Arts"),
            ("Art (Graphic Design, M.F.A.)", "Master of Fine Arts"),
            ("Art (Inter-Media)", "Master of Fine Arts"),
            ("Art (Photography, M.F.A.)", "Master of Fine Arts"),
            ("Art (Printmaking)", "Master of Fine Arts"),
            ("Art (Sculpture)", "Master of Fine Arts"),
            ("Art (Art History, M.L.S.)", "Master of Liberal Studies"),
            ("Art (Community Engaged Art, M.P.S.)", "Master of Professional Studies"),
            ("Art", "Minor"),
            ("Studio Art", "Minor"),
            ("Music (Minor)", "Minor"),
            ("Theatre", "Minor"),
        ],
        "School of Criminal Justice, Leadership, and Sociology": [
            ("Financial Forensics and Fraud Investigation", "BS"),
            ("Criminal Justice (B.A.)", "Bachelor of Arts"),
            ("Criminal Justice (Addiction Counseling, B.A.)", "Bachelor of Arts"),
            ("Criminal Justice (B.S.)", "Bachelor of Science"),
            ("Criminal Justice (Addiction Counseling, B.S.)", "Bachelor of Science"),
            ("Criminalistics (Crime Mapping & Spatial Analysis)", "Bachelor of Science"),
            ("Criminalistics (Forensic Biology)", "Bachelor of Science"),
            ("Criminalistics (Forensic Chemistry)", "Bachelor of Science"),
            ("Applied Leadership", "Bachelor of Applied Science"),
            ("Organizational Leadership (B.A.)", "Bachelor of Arts"),
            ("Organizational Leadership (B.S.)", "Bachelor of Science"),
            ("Sociology (B.A.)", "Bachelor of Arts"),
            ("Sociology (Addictions Counseling, B.A.)", "Bachelor of Arts"),
            ("Sociology (Gender and Sexuality Studies, B.A.)", "Bachelor of Arts"),
            ("Sociology (B.S.)", "Bachelor of Science"),
            ("Sociology (Addictions Counseling, B.S.)", "Bachelor of Science"),
            ("Sociology (Gender and Sexuality Studies, B.S.)", "Bachelor of Science"),
            ("Criminal Justice (Criminal Justice)", "Master of Professional Studies"),
            ("Leadership Studies (Organizational Leadership)", "Master of Professional Studies"),
            ("Leadership (Leadership Studies)", "Master of Business Administration"),
            ("Global Strategic Leadership", "Master of Science"),
            ("Spanish", "Master of Liberal Studies"),
            ("Sociology (Rural Advocacy)", "Master of Liberal Studies"),
            ("Sociology (Social Entrepreneurship)", "Master of Professional Studies"),
            ("Criminal Justice (Minor)", "Minor"),
            ("Leadership Studies", "Minor"),
            ("Military Science and Leadership", "Minor"),
            ("Gender and Sexuality Studies", "Minor"),
            ("Sociology (Minor)", "Minor"),
        ],
        "Department of Communication Studies, Law, and Political Science": [
            ("Communication (Applied)", "Bachelor of Arts"),
            ("Communication (Organizational Communication)", "Bachelor of Arts"),
            ("Communication (Public Relations and Advertising)", "Bachelor of Arts"),
            ("Political Science (B.A.)", "Bachelor of Arts"),
            ("Political Science (B.S.)", "Bachelor of Science"),
            ("Political Science (Global Studies)", "Master of Liberal Studies"),
            ("Political Science (Political Leadership and Public Service)", "Master of Liberal Studies"),
            ("Political Science (Political Science)", "Master of Liberal Studies"),
            ("Political Science (Public Administration)", "Master of Liberal Studies"),
            ("Applied Communication", "Minor"),
            ("Organizational Communication", "Minor"),
            ("Public Relations and Advertising", "Minor"),
            ("Political Science (Minor)", "Minor"),
        ],
        "Department of English and Modern Languages": [
            ("English (Literature)", "Bachelor of Arts"),
            ("English (Teaching)", "Bachelor of Arts"),
            ("English (Writing)", "Bachelor of Arts"),
            ("Global Business English", "Bachelor of Arts"),
            ("Modern Languages (Spanish and Teacher Education)", "Bachelor of Arts"),
            ("Modern Languages (Spanish for Specific Purposes)", "Bachelor of Arts"),
            ("English (M.A.)", "Master of Arts"),
            ("English (Literary Arts)", "Master of Liberal Studies"),
            ("English (Minor)", "Minor"),
            ("Spanish", "Minor"),
        ],
        "Department of History and Philosophy": [
            ("History (B.A.)", "Bachelor of Arts"),
            ("History (Secondary Education)", "Bachelor of Arts"),
            ("Religious Education and Community Engagement", "Bachelor of Arts"),
            ("History (M.A.)", "Master of Arts"),
            ("History (Public History)", "Master of Arts"),
            ("Philosophy (Philosophy)", "Master of Liberal Studies"),
            ("History (Minor)", "Minor"),
            ("Philosophy", "Minor"),
        ],
    },
    "Robbins College of Business and Entrepreneurship": {
        "Department of Informatics": [
            ("Computer Science (B.S.)", "Bachelor of Science"),
            ("Information Networking and Telecommunications (Computer Networking and Telecommunications)", "Bachelor of Arts"),
            ("Information Networking and Telecommunications (Cybersecurity, B.A.)", "Bachelor of Arts"),
            ("Information Networking and Telecommunications (Digital Media Production and Journalism, B.A.)", "Bachelor of Arts"),
            ("Information Networking and Telecommunications (Health Informatics, B.A.)", "Bachelor of Arts"),
            ("Information Networking and Telecommunications (Information Systems, B.A.)", "Bachelor of Arts"),
            ("Information Networking and Telecommunications (Web and Mobile Application Development, B.A.)", "Bachelor of Arts"),
            ("Management Information Systems (B.B.A.)", "Bachelor of Business Administration"),
            ("Information Networking and Telecommunications (Computer Networking)", "Bachelor of Science"),
            ("Information Networking and Telecommunications (Cybersecurity, B.S.)", "Bachelor of Science"),
            ("Information Networking and Telecommunications (Digital Media Production and Journalism, B.S.)", "Bachelor of Science"),
            ("Information Networking and Telecommunications (Health Informatics, B.S.)", "Bachelor of Science"),
            ("Information Networking and Telecommunications (Information Systems, B.S.)", "Bachelor of Science"),
            ("Information Networking and Telecommunications (Web and Mobile Application Development, B.S.)", "Bachelor of Science"),
            ("Computer Science (M.S.)", "Master of Science"),
            ("Informatics (Information Assurance)", "Master of Business Administration"),
            ("Informatics (Management Information Systems, M.B.A.)", "Master of Business Administration"),
            ("Informatics (Data Analytics)", "Master of Liberal Studies"),
            ("Informatics (Management Information Systems, M.L.S.)", "Master of Liberal Studies"),
            ("Informatics (Computer Networking)", "Master of Professional Studies"),
            ("Informatics (Cyber Security)", "Master of Professional Studies"),
            ("Informatics (Digital Cinema Studies)", "Master of Professional Studies"),
            ("Informatics (Information Assurance Management)", "Master of Professional Studies"),
            ("Informatics (Information Systems)", "Master of Professional Studies"),
            ("Informatics (Web and Mobile Applications)", "Master of Professional Studies"),
            ("Computer Science (Minor)", "Minor"),
            ("Computer Networking", "Minor"),
            ("Information Systems (non-Business majors)", "Minor"),
            ("Management Information Systems (Minor)", "Minor"),
            ("Media Production", "Minor"),
            ("Web Development", "Minor"),
        ],
        "Department of Applied Business Studies": [
            ("Marketing (B.B.A.)", "Bachelor of Business Administration"),
            ("Tourism & Hospitality Management (B.B.A.)", "Bachelor of Business Administration"),
            ("Business Education (Corporate Communications)", "Bachelor of Science"),
            ("Business Education (Talent Development)", "Bachelor of Science"),
            ("Business Education (Teacher Licensure)", "Bachelor of Science"),
            ("Tourism and Hospitality Management", "Bachelor of Science"),
            ("Applied Business (Corporate Communication, M.B.A.)", "Master of Business Administration"),
            ("Applied Business (Digital Marketing)", "Master of Business Administration"),
            ("Applied Business (Marketing)", "Master of Business Administration"),
            ("Applied Business (Tourism and Hospitality Management)", "Master of Business Administration"),
            ("Applied Business (Corporate Communication, M.L.S.)", "Master of Liberal Studies"),
            ("Applied Business (Workforce Development)", "Master of Professional Studies"),
            ("Education (Business Emphasis)", "Master of Science"),
            ("Business (General)", "Master of Business Administration"),
            ("Healthcare Management", "Master of Business Administration"),
            ("Business Communication", "Minor"),
            ("Marketing (Minor)", "Minor"),
            ("Tourism & Hospitality Management (Minor)", "Minor"),
        ],
        "Department of Economics, Finance and Accounting": [
            ("Accounting (B.B.A.)", "Bachelor of Business Administration"),
            ("Accounting (Public Accounting)", "Bachelor of Business Administration"),
            ("Finance (B.B.A.)", "Bachelor of Business Administration"),
            ("Finance (Banking)", "Bachelor of Business Administration"),
            ("Finance (Economics)", "Bachelor of Business Administration"),
            ("Finance (Financial Planning)", "Bachelor of Business Administration"),
            ("International Business and Economics", "Bachelor of Business Administration"),
            ("Financial Forensics and Fraud Investigation", "Bachelor of Science"),
            ("EFA (Accounting)", "Master of Business Administration"),
            ("EFA (Finance)", "Master of Business Administration"),
            ("EFA (International Business)", "Master of Business Administration"),
            ("Accounting (Minor)", "Minor"),
            ("Banking", "Minor"),
            ("Economics", "Minor"),
            ("Finance (Minor)", "Minor"),
            ("International Business & Economics", "Minor"),
        ],
        "Department of Management": [
            ("Management (B.B.A.)", "Bachelor of Business Administration"),
            ("Management (Entrepreneurship)", "Bachelor of Business Administration"),
            ("Management (Human Resource Management, B.B.A.)", "Bachelor of Business Administration"),
            ("Management (Operations Management, B.B.A.)", "Bachelor of Business Administration"),
            ("Leadership (Leadership Studies)", "Master of Business Administration"),
            ("Management (Human Resource Management, M.B.A.)", "Master of Business Administration"),
            ("Management (Operations Management, M.B.A.)", "Master of Business Administration"),
            ("Management (Global Management)", "Master of Liberal Studies"),
            ("Management (Human Resource Information Systems)", "Master of Professional Studies"),
            ("Management (Human Resource Management, M.P.S.)", "Master of Professional Studies"),
            ("Business Administration (for Non-B.B.A. Majors Only)", "Minor"),
            ("Entrepreneurship (For Non-BBA Majors)", "Minor"),
            ("International Business", "Minor"),
            ("Management (Minor)", "Minor"),
        ],
    },
    "College of Education": {
        "Department of Teacher Education": [
            ("Elementary Education (Building Essential Skills Together – BEST)", "Bachelor of Science"),
            ("Elementary Education (Early Childhood Unified)", "Bachelor of Science"),
            ("Elementary Education (PreK-6)", "Bachelor of Science"),
            ("Secondary Education", "Bachelor of Science"),
            ("Secondary Education (PreK-12 Special Education High and Low Incidence)", "Bachelor of Science"),
            ("Special Education", "Minor"),
            ("Special Education (non-teaching majors)", "Minor"),
        ],
        "Department of Advanced Education Programs": [
            ("Education (Business Emphasis)", "Master of Science"),
            ("Education (Chemistry Emphasis)", "Master of Science"),
            ("Education (Curriculum and Instruction - Adult Teaching and Learning)", "Master of Science"),
            ("Education (Curriculum and Instruction - Exceptional and Diverse Learners)", "Master of Science"),
            ("Education (Curriculum and Instruction - STEM Education)", "Master of Science"),
            ("Education (Curriculum and Instruction - The Effective Teacher)", "Master of Science"),
            ("Education (Curriculum and Instruction - The Science of Language and Literacy)", "Master of Science"),
            ("Education (Elementary Education, M.S.)", "Master of Science"),
            ("Education (Elementary Transition to Teaching)", "Master of Science"),
            ("Education (English for Speakers of Other Languages Endorsement)", "Master of Science"),
            ("Education (Library Media Specialist Endorsement)", "Master of Science"),
            ("Education (Mathematics Emphasis)", "Master of Science"),
            ("Education (Reading Specialist Emphasis)", "Master of Science"),
            ("Education (Secondary Education - Traditional Certification)", "Master of Science"),
            ("Education (Secondary or PreK-12 Education - Transition to Teaching)", "Master of Science"),
            ("Counseling (Clinical Mental Health Counseling)", "Master of Science"),
            ("Counseling (School Counseling)", "Master of Science"),
            ("Education Administration", "Master of Science"),
            ("Instructional Technology", "Master of Science"),
            ("Instructional Technology (AI Literacy for Teaching Learning)", "Master of Science"),
            ("Special Education (Gifted)", "Master of Science"),
            ("Special Education (High Incidence Limited Residency Licensure)", "Master of Science"),
            ("Special Education (High Incidence)", "Master of Science"),
            ("Special Education (Low Incidence Limited Residency Licensure)", "Master of Science"),
            ("Special Education (Low Incidence)", "Master of Science"),
            ("Advanced Professional Studies (Business Education and Workforce Leadership)", "Education Specialist"),
            ("Advanced Professional Studies (Education Administration)", "Education Specialist"),
            ("Advanced Professional Studies (Education Innovation and Leadership)", "Education Specialist"),
            ("Advanced Professional Studies (Leadership in Reading)", "Education Specialist"),
        ],
    },
    "College of Health and Behavioral Sciences": {
        "Department of Allied Health": [
            ("Radiologic Technology", "Associate of Science"),
            ("Medical Diagnostic Imaging", "Bachelor of Science"),
            ("Medical Diagnostic Imaging (Ultrasound)", "Bachelor of Science"),
            ("Allied Health (Medical Imaging Administration or Education)", "Master of Professional Studies"),
        ],
        "Department of Communication Sciences and Disorders": [
            ("Technology and Leadership (Speech-Language Pathology Assistant)", "Associate of Applied Science"),
            ("Communication Sciences and Disorders (B.S.)", "Bachelor of Science"),
            ("Speech-Language Pathology", "Master of Science"),
            ("Communication Sciences and Disorders (Minor)", "Minor"),
        ],
        "Department of Health and Human Performance": [
            ("Technology and Leadership (Massage Therapy)", "Associate of Applied Science"),
            ("Health and Human Performance", "Bachelor of Science"),
            ("Health and Human Performance (Exercise Science, B.S.)", "Bachelor of Science"),
            ("Health and Human Performance (Health Promotion and Fitness)", "Bachelor of Science"),
            ("Health and Human Performance (K-12 Teaching/Coaching)", "Bachelor of Science"),
            ("Health and Human Performance (Recreation or Sports Management)", "Bachelor of Science"),
            ("Health and Human Performance (Sport and Exercise Therapy)", "Bachelor of Science"),
            ("Health Studies", "Bachelor of Science"),
            ("HHP (Gerontology, M.L.S.)", "Master of Liberal Studies"),
            ("HHP (Health Sciences)", "Master of Liberal Studies"),
            ("HHP (Gerontology, M.P.S.)", "Master of Professional Studies"),
            ("HHP (Public Health Administration)", "Master of Professional Studies"),
            ("HHP (Sport Management)", "Master of Professional Studies"),
            ("Health and Human Performance (Exercise Science, M.S.)", "Master of Science"),
            ("Health and Human Performance (Sport Administration)", "Master of Science"),
            ("HHP (Sports Management)", "Master of Business Administration"),
            ("Gerontology", "Minor"),
        ],
        "Department of Nursing": [
            ("Nursing", "Bachelor of Science"),
            ("Nursing (RN to BSN)", "Bachelor of Science"),
            ("Healthcare Management", "Master of Business Administration"),
            ("Nursing (Nursing Administration)", "Master of Science"),
            ("Nursing (Nursing Education)", "Master of Science"),
            ("Nursing (BSN to DNP)", "Doctor of Nursing Practice"),
            ("Nursing (MSN to DNP)", "Doctor of Nursing Practice"),
        ],
        "Department of Psychology": [
            ("Psychology (Applied Mental Health, B.A.)", "Bachelor of Arts"),
            ("Psychology (Developmental - Cultural, B.A.)", "Bachelor of Arts"),
            ("Psychology (Social - Cognitive, B.A.)", "Bachelor of Arts"),
            ("Psychology (Applied Mental Health, B.S.)", "Bachelor of Science"),
            ("Psychology (Developmental - Cultural, B.S.)", "Bachelor of Science"),
            ("Psychology (Social - Cognitive, B.S.)", "Bachelor of Science"),
            ("Psychology (Clinical)", "Master of Science"),
            ("Psychology (School)", "Master of Science"),
            ("School Psychology", "Education Specialist"),
            ("Psychology", "Minor"),
        ],
        "Department of Social Work": [
            ("Social Work", "Bachelor of Social Work"),
            ("Social Work (Clinical)", "Master of Social Work"),
        ],
    },
    "Peter Werth College of Science, Technology and Mathematics": {
        "Department of Applied Technology": [
            ("Technology and Leadership (Business Communication and Technology)", "Associate of Applied Science"),
            ("Technology and Leadership (Business Training Systems)", "Associate of Applied Science"),
            ("Technology and Leadership (Computer Networking)", "Associate of Applied Science"),
            ("Technology and Leadership (Industrial Technology)", "Associate of Applied Science"),
            ("Technology and Leadership (Leadership Studies)", "Associate of Applied Science"),
            ("Technology and Leadership (Massage Therapy)", "Associate of Applied Science"),
            ("Technology and Leadership (Speech-Language Pathology Assistant)", "Associate of Applied Science"),
            ("Technology Leadership (Business & Industry)", "Bachelor of Science"),
            ("Technology Leadership (Career & Technical Education)", "Bachelor of Science"),
            ("Technology Studies (Construction Management)", "Bachelor of Science"),
            ("Technology Studies (Construction Technology)", "Bachelor of Science"),
            ("Technology Studies (Engineering Design Technology)", "Bachelor of Science"),
            ("Technology Studies (Manufacturing Technology)", "Bachelor of Science"),
            ("Technology Studies (Technology Education)", "Bachelor of Science"),
        ],
        "Department of Agriculture": [
            ("Agricultural Business", "Bachelor of Science"),
            ("Agriculture (Agricultural Communication)", "Bachelor of Science"),
            ("Agriculture (Agricultural Education)", "Bachelor of Science"),
            ("Agriculture (Agricultural Leadership)", "Bachelor of Science"),
            ("Agriculture (Agronomy Business)", "Bachelor of Science"),
            ("Agriculture (Agronomy)", "Bachelor of Science"),
            ("Agriculture (Animal Science)", "Bachelor of Science"),
            ("Agriculture (General)", "Bachelor of Science"),
            ("Agriculture (Agribusiness, M.B.A.)", "Master of Business Administration"),
            ("Agribusiness", "Minor"),
            ("Agriculture", "Minor"),
            ("Agronomy", "Minor"),
            ("Animal Science", "Minor"),
        ],
        "Department of Biological Sciences": [
            ("Biology (Education)", "Bachelor of Science"),
            ("Biology (General Biology)", "Bachelor of Science"),
            ("Biology (Health Professions)", "Bachelor of Science"),
            ("Biology (Natural Resources)", "Bachelor of Science"),
            ("Criminalistics (Forensic Biology)", "Bachelor of Science"),
            ("Biology (M.S.)", "Master of Science"),
            ("Biology (Minor)", "Minor"),
        ],
        "Department of Chemistry": [
            ("Chemistry (B.A.)", "Bachelor of Arts"),
            ("Chemistry (Teacher Education)", "Bachelor of Arts"),
            ("Chemistry (B.S.)", "Bachelor of Science"),
            ("Chemistry (Biochemistry)", "Bachelor of Science"),
            ("Chemistry (Forensic Science)", "Bachelor of Science"),
            ("Criminalistics (Forensic Chemistry)", "Bachelor of Science"),
            ("Chemistry (Chemistry)", "Master of Professional Studies"),
            ("Education (Chemistry Emphasis)", "Master of Science"),
            ("Chemistry (Minor)", "Minor"),
        ],
        "Department of Geosciences": [
            ("Environmental Geosciences", "Bachelor of Arts"),
            ("Geosciences (Applied Geology)", "Bachelor of Science"),
            ("Geosciences (Geography, B.S.)", "Bachelor of Science"),
            ("Geosciences (Geology, B.S.)", "Bachelor of Science"),
            ("Criminalistics (Crime Mapping & Spatial Analysis)", "Bachelor of Science"),
            ("Geosciences", "Master of Science"),
            ("Geosciences (Geography, Minor)", "Minor"),
            ("Geosciences (Geology, Minor)", "Minor"),
        ],
        "Department of Mathematics": [
            ("Mathematics (Industrial/Academic, B.A.)", "Bachelor of Arts"),
            ("Mathematics (Middle School Math, B.A.)", "Bachelor of Arts"),
            ("Mathematics (Teaching, B.A.)", "Bachelor of Arts"),
            ("Mathematics (Industrial/Academic, B.S.)", "Bachelor of Science"),
            ("Mathematics (Middle School Math, B.S.)", "Bachelor of Science"),
            ("Mathematics (Teaching, B.S.)", "Bachelor of Science"),
            ("Education (Mathematics Emphasis)", "Master of Science"),
            ("Mathematics", "Minor"),
        ],
        "Department of Physics": [
            ("Physics (B.A.)", "Bachelor of Arts"),
            ("Dual Degree Physics and Engineering (3+2 Program)", "Bachelor of Science"),
            ("Physics (B.S.)", "Bachelor of Science"),
            ("Physics (Pre-Engineering) (2+2 Program)", "Bachelor of Science"),
            ("Physics (Minor)", "Minor"),
        ],
    },
}

# One "flagship" program per department gets algorithmically generated demo
# courses/modules/outcomes (subject word lists below); every other real catalog
# program is seeded as structure only. department -> (flagship_program_name, course_prefix, subjects)
FLAGSHIP_COURSES = {
    "School of Visual and Performing Arts": ("Art (Studio Art)", "ART", ["Drawing Fundamentals", "Painting", "Ceramics", "Graphic Design", "Sculpture", "Art History Survey", "Photography", "Printmaking", "Typography", "Digital Illustration", "Portfolio Development", "Motion Design"]),
    "School of Criminal Justice, Leadership, and Sociology": ("Criminal Justice (B.A.)", "CRJ", ["Introduction to Criminal Justice", "Criminology", "Corrections", "Policing", "Juvenile Justice", "Criminal Law", "Victimology", "Forensic Investigation", "Ethics in Criminal Justice", "Terrorism and Homeland Security", "Research Methods in CJ", "White Collar Crime"]),
    "Department of Communication Studies, Law, and Political Science": ("Communication (Applied)", "COMM", ["Public Speaking", "Interpersonal Communication", "Organizational Communication", "Persuasion", "Intercultural Communication", "Small Group Communication", "Rhetorical Theory", "Communication Research", "Health Communication", "Conflict Communication", "Media Criticism", "Argumentation"]),
    "Department of English and Modern Languages": ("English (Literature)", "ENG", ["Composition I", "Composition II", "World Literature", "American Literature", "Creative Writing", "Technical Writing", "Linguistics", "British Literature", "Poetry Workshop", "Fiction Workshop", "Rhetoric", "Literary Criticism"]),
    "Department of History and Philosophy": ("History (B.A.)", "HIST", ["US History Survey", "World Civilizations", "Kansas History", "Modern Europe", "Public History", "Historiography", "American West", "Ancient World", "Modern Asia", "Latin America", "War and Society", "Digital History"]),
    "Department of Informatics": ("Computer Science (B.S.)", "CSCI", ["Programming I", "Programming II", "Data Structures", "Algorithms", "Computer Organization", "Operating Systems", "Database Systems", "Software Engineering", "Computer Networks", "Artificial Intelligence", "Machine Learning", "Senior Project"]),
    "Department of Applied Business Studies": None,  # Applied Business Studies: rich seed below
    "Department of Economics, Finance and Accounting": ("Accounting (B.B.A.)", "ECFI", ["Microeconomics", "Macroeconomics", "Corporate Finance", "Financial Accounting", "Managerial Accounting", "Investments", "Auditing", "Taxation", "Banking", "Econometrics", "Risk Management", "International Finance"]),
    "Department of Management": ("Management (B.B.A.)", "MGMT", ["Organizational Behavior", "Operations Management", "Small Business Management", "Entrepreneurship", "Project Management", "Supply Chain Management", "Negotiation", "Business Ethics", "International Management", "Quality Management", "Change Management", "Compensation"]),
    "Department of Teacher Education": ("Elementary Education (PreK-6)", "TEEL", ["Foundations of Education", "Educational Psychology", "Classroom Management", "Literacy Methods", "Math Methods", "Science Methods", "Social Studies Methods", "Assessment of Learning", "Diverse Learners", "Educational Technology", "Clinical Practicum", "Student Teaching Seminar"]),
    "Department of Advanced Education Programs": ("Education Administration", "AEP", ["School Counseling Foundations", "Instructional Leadership", "Curriculum Development", "Education Law", "School Finance", "Supervision of Instruction", "Counseling Techniques", "Group Counseling", "Special Education Law", "Program Evaluation", "Action Research", "Internship in Leadership"]),
    "Department of Allied Health": ("Medical Diagnostic Imaging", "AHE", ["Medical Terminology", "Radiologic Science", "Health Care Systems", "Medical Diagnostic Imaging", "Health Information Management", "Pathology for Imaging", "Patient Care Skills", "Radiation Safety", "Sectional Anatomy", "Clinical Education I", "Clinical Education II", "Health Care Ethics"]),
    "Department of Communication Sciences and Disorders": ("Communication Sciences and Disorders (B.S.)", "CSD", ["Introduction to Communication Disorders", "Phonetics", "Anatomy of Speech", "Language Development", "Audiology Basics", "Speech Science", "Articulation Disorders", "Language Disorders", "Aural Rehabilitation", "Clinical Methods", "Fluency Disorders", "Augmentative Communication"]),
    "Department of Health and Human Performance": ("Health and Human Performance", "HHP", ["Foundations of Kinesiology", "Exercise Physiology", "Biomechanics", "Motor Learning", "Sport Psychology", "Nutrition for Performance", "Strength and Conditioning", "Adapted Physical Activity", "Sport Management", "Exercise Testing", "Health Promotion", "Internship in HHP"]),
    "Department of Nursing": ("Nursing", "NURS", ["Fundamentals of Nursing", "Health Assessment", "Pathophysiology", "Pharmacology", "Medical-Surgical Nursing", "Maternal-Child Nursing", "Psychiatric Nursing", "Community Health Nursing", "Nursing Research", "Nursing Leadership", "Critical Care Nursing", "Capstone Clinical"]),
    "Department of Psychology": ("Psychology (Applied Mental Health, B.A.)", "PSY", ["General Psychology", "Developmental Psychology", "Abnormal Psychology", "Cognitive Psychology", "Social Psychology", "Behavioral Neuroscience", "Learning and Memory", "Psychological Testing", "Research Methods", "Statistics for Psychology", "Counseling Psychology", "History of Psychology"]),
    "Department of Social Work": ("Social Work", "SOCW", ["Introduction to Social Work", "Human Behavior and Social Environment", "Social Welfare Policy", "Practice with Individuals", "Practice with Groups", "Practice with Communities", "Child Welfare", "Gerontological Social Work", "Substance Abuse", "Field Practicum I", "Field Practicum II", "Social Work Research"]),
    "Department of Applied Technology": ("Technology Studies (Manufacturing Technology)", "TECS", ["Engineering Graphics", "Manufacturing Processes", "CNC Machining", "Welding Technology", "Construction Management", "Electronics", "Fluid Power", "Industrial Safety", "CAD/CAM", "Robotics and Automation", "Quality Assurance", "Technology Capstone"]),
    "Department of Agriculture": ("Agricultural Business", "AGRI", ["Introduction to Agriculture", "Animal Science", "Agronomy", "Agricultural Economics", "Soil Science", "Livestock Production", "Crop Production", "Agribusiness Management", "Range Management", "Precision Agriculture", "Agricultural Policy", "Farm Management"]),
    "Department of Biological Sciences": ("Biology (General Biology)", "BIOL", ["General Biology", "Cell Biology", "Genetics", "Ecology", "Microbiology", "Human Anatomy", "Human Physiology", "Evolution", "Botany", "Zoology", "Molecular Biology", "Wildlife Management"]),
    "Department of Chemistry": ("Chemistry (B.S.)", "CHEM", ["General Chemistry I", "General Chemistry II", "Organic Chemistry I", "Organic Chemistry II", "Analytical Chemistry", "Biochemistry", "Physical Chemistry", "Inorganic Chemistry", "Instrumental Analysis", "Environmental Chemistry", "Chemical Research", "Chemistry Seminar"]),
    "Department of Geosciences": ("Geosciences (Geology, B.S.)", "GSCI", ["Physical Geology", "Historical Geology", "Meteorology", "Physical Geography", "GIS Fundamentals", "Mineralogy", "Sedimentology", "Structural Geology", "Hydrogeology", "Remote Sensing", "Paleontology", "Field Geology"]),
    "Department of Mathematics": ("Mathematics (Industrial/Academic, B.S.)", "MATH", ["College Algebra", "Trigonometry", "Calculus I", "Calculus II", "Calculus III", "Linear Algebra", "Differential Equations", "Discrete Mathematics", "Probability and Statistics", "Abstract Algebra", "Real Analysis", "Numerical Methods"]),
    "Department of Physics": ("Physics (B.S.)", "PHYS", ["College Physics I", "College Physics II", "University Physics I", "University Physics II", "Modern Physics", "Classical Mechanics", "Electromagnetism", "Thermodynamics", "Quantum Mechanics", "Optics", "Astronomy", "Physics Research"]),
}


def seed() -> None:
    init_db()
    with Session(engine) as s:
        if s.exec(select(Node)).first():
            print("Database already seeded; skipping.")
            return

        def node(**kw) -> Node:
            n = Node(**kw)
            s.add(n)
            s.flush()
            return n

        def outcome(**kw) -> Outcome:
            o = Outcome(**kw)
            s.add(o)
            s.flush()
            return o

        fhsu = node(node_type=NodeType.institution, node_name="Fort Hays State University")
        grouping = node(node_type=NodeType.college_dept_grouping,
                        node_name="Academic Colleges & Departments", parent_node_id=fhsu.node_id)

        ilo1 = outcome(outcome_level=OutcomeLevel.institutional, outcome_code="ILO1",
                       outcome_text="Graduates communicate effectively in professional contexts.",
                       hlc_criterion_tag="3.B", owning_node_id=fhsu.node_id)

        def add_course(program_node, code, title, credits, modules):
            """modules: [(module_name, [(clo, [(atype, aname, mastery, method)])])]"""
            cnode = node(node_type=NodeType.course, node_name=code, parent_node_id=program_node.node_id)
            c = Course(course_title=title, credit_hours=credits,
                       owning_node_id=program_node.node_id, node_id=cnode.node_id)
            s.add(c)
            s.flush()
            for mod_name, clos in modules:
                mnode = node(node_type=NodeType.module, node_name=mod_name, parent_node_id=cnode.node_id)
                for clo, acts in clos:
                    for atype, aname, mastery, method in acts:
                        act = Activity(course_id=c.course_id, module_node_id=mnode.node_id,
                                       activity_type=atype, activity_name=aname)
                        s.add(act)
                        s.flush()
                        s.add(Mapping(course_id=c.course_id, target_outcome_id=clo.outcome_id,
                                      activity_id=act.activity_id, module_node_id=mnode.node_id,
                                      mastery_level=mastery, assessment_method=method))
            return cnode, c

        college_nodes = {}
        abs_dept = None
        abs_college = None
        abs_program = None
        hhp_plos = None  # captured below for real closing-the-loop action-item demo data

        for college_name, departments in FHSU_STRUCTURE.items():
            college = node(node_type=NodeType.college, node_name=college_name,
                           parent_node_id=grouping.node_id)
            college_nodes[college_name] = college
            for dept_name, programs in departments.items():
                dept = node(node_type=NodeType.department, node_name=dept_name,
                            parent_node_id=college.node_id)

                flagship = FLAGSHIP_COURSES[dept_name]
                if flagship is None:  # Applied Business Studies: rich hand-written seed below
                    # create every real catalog program node now (structure only); the rich
                    # section further down looks up "Marketing (B.B.A.)" as its flagship
                    for prog_name, degree_type in programs:
                        prog = node(node_type=NodeType.program, node_name=prog_name,
                                   parent_node_id=dept.node_id, degree_type=degree_type)
                        if prog_name == "Marketing (B.B.A.)":
                            abs_program = prog
                    abs_dept, abs_college = dept, college
                    continue

                flagship_name, prefix, subjects = flagship

                # generated program outcomes, owned by the flagship program once it's created
                plo_specs = [
                    (f"{prefix}-PLO{i+1}",
                     f"{dept_name.replace('Department of ', '').replace('School of ', '')} program outcome {i+1}.",
                     ["3.A", "3.B", "4.B"][i % 3])
                    for i in range(3)
                ]

                flagship_program = None
                plos = []
                for prog_name, degree_type in programs:
                    prog = node(node_type=NodeType.program, node_name=prog_name,
                               parent_node_id=dept.node_id, degree_type=degree_type)
                    if prog_name == flagship_name:
                        flagship_program = prog
                        plos = [
                            outcome(outcome_level=OutcomeLevel.program, outcome_code=code,
                                   outcome_text=text, hlc_criterion_tag=tag,
                                   parent_outcome_id=ilo1.outcome_id if i == 0 else None,
                                   owning_node_id=prog.node_id)
                            for i, (code, text, tag) in enumerate(plo_specs)
                        ]
                        if dept_name == "Department of Health and Human Performance":
                            hhp_plos = plos

                # generated courses: number series 101..612, mastery scaffolds upward
                for idx, subject in enumerate(subjects):
                    number = 101 + (idx * 47) % 500
                    level = number // 100
                    mastery = I if level <= 2 else (R if level <= 4 else M)
                    code = f"{prefix} {number}"
                    clo = outcome(outcome_level=OutcomeLevel.course,
                                  outcome_code=f"{prefix}{number}-CLO1",
                                  outcome_text=f"Apply core concepts of {subject.lower()}.",
                                  parent_outcome_id=plos[idx % 3].outcome_id,
                                  owning_node_id=None)
                    add_course(flagship_program, code, subject, 3, [
                        (f"Module 1: {subject} Foundations", [
                            (clo, [
                                (LA, f"Lecture: {subject} Overview", mastery, None),
                                (AS, f"Quiz: {subject} Fundamentals", mastery, "Objective quiz"),
                            ]),
                        ]),
                        (f"Module 2: Applied {subject}", [
                            (clo, [
                                (LA, f"Activity: {subject} Practice", mastery, None),
                                (AS, f"Project: Applied {subject}", mastery, "Project"),
                            ]),
                        ]),
                    ])
                s.commit()

        # ---- Applied Business Studies: rich demo seed ----
        dept = abs_dept
        prog = abs_program  # "Marketing (B.B.A.)" node, created above alongside its sibling programs
        plo1 = outcome(outcome_level=OutcomeLevel.program, outcome_code="PLO1",
                       outcome_text="Apply core management principles to organizational problems.",
                       hlc_criterion_tag="3.A", parent_outcome_id=ilo1.outcome_id, owning_node_id=prog.node_id)
        plo2 = outcome(outcome_level=OutcomeLevel.program, outcome_code="PLO2",
                       outcome_text="Develop and evaluate marketing strategies using market data.",
                       hlc_criterion_tag="3.A", owning_node_id=prog.node_id)
        plo3 = outcome(outcome_level=OutcomeLevel.program, outcome_code="PLO3",
                       outcome_text="Demonstrate professional business communication skills.",
                       hlc_criterion_tag="3.B", parent_outcome_id=ilo1.outcome_id, owning_node_id=prog.node_id)
        outcome(outcome_level=OutcomeLevel.program, outcome_code="PLO4",
                outcome_text="Evaluate ethical and legal implications of business decisions.",
                hlc_criterion_tag="3.D", owning_node_id=prog.node_id)  # deliberately unmapped -> dead-end

        def clo(code, text, parent):
            return outcome(outcome_level=OutcomeLevel.course, outcome_code=code, outcome_text=text,
                           parent_outcome_id=parent.outcome_id if parent else None,
                           owning_node_id=prog.node_id)

        add_course(prog, "MGT 301", "Management Principles", 3, [
            ("Module 1: Foundations of Management", [
                (clo("MGT301-CLO1", "Describe the four functions of management.", plo1), [
                    (LA, "Lecture: Evolution of Management Thought", I, None),
                    (AS, "Quiz 1: Management Functions", I, "Objective quiz"),
                ]),
            ]),
            ("Module 2: Planning & Strategy", [
                (clo("MGT301-CLO2", "Construct a basic strategic plan for a small organization.", plo1), [
                    (LA, "Case Study: Regional Business Planning", I, None),
                    (AS, "Strategic Plan Draft", R, "Written assignment"),
                ]),
            ]),
            ("Module 3: Leading Teams", [
                (clo("MGT301-CLO3", "Explain motivation and leadership theories in team settings.", plo3), [
                    (LA, "Discussion: Leadership Styles", I, None),
                    (AS, "Team Leadership Reflection Paper", I, "Reflection paper"),
                ]),
            ]),
        ])

        add_course(prog, "MKT 301", "Marketing Principles", 3, [
            ("Module 1: Marketing Environment", [
                (clo("MKT301-CLO1", "Identify components of the marketing environment.", plo2), [
                    (LA, "Lecture: The Marketing Mix", I, None),
                    (AS, "Quiz 1: Marketing Environment", I, "Objective quiz"),
                ]),
            ]),
            ("Module 2: Consumer Behavior", [
                (clo("MKT301-CLO2", "Analyze consumer decision-making processes.", plo2), [
                    (LA, "Activity: Buyer Persona Workshop", I, None),
                    (AS, "Consumer Behavior Case Analysis", R, "Case analysis"),
                ]),
            ]),
        ])

        add_course(prog, "MGT 400", "Human Resource Management", 3, [
            ("Module 1: HR Fundamentals", [
                (clo("MGT400-CLO1", "Apply employment law fundamentals to HR scenarios.", plo1), [
                    (LA, "Lecture: Employment Law Overview", R, None),
                    (AS, "HR Scenario Analysis", R, "Scenario analysis"),
                ]),
                # deliberate ORPHAN: no parent program outcome
                (clo("MGT400-CLO2", "Design a structured interview protocol.", None), [
                    (LA, "Workshop: Interview Question Design", I, None),
                    (AS, "Interview Protocol Project", R, "Project"),
                ]),
            ]),
        ])

        add_course(prog, "MGT 601", "Strategic Management (Capstone)", 3, [
            ("Module 1: Integrative Strategy", [
                (clo("MGT601-CLO1", "Synthesize functional business knowledge into an enterprise strategy.", plo1), [
                    (LA, "Simulation: Capstone Business Simulation", M, None),
                    (AS, "Capstone Strategic Plan & Presentation", M, "Capstone project"),
                ]),
                (clo("MGT601-CLO2", "Present strategic recommendations to stakeholders.", plo3), [
                    (AS, "Executive Presentation", M, "Oral presentation"),
                ]),
            ]),
        ])

