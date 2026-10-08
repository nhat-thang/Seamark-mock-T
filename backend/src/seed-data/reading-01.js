// Đề TOEIC Reading số 1 (Part 5–7, câu 101–200) — nạp bằng `npm run seed`.
//
// Quy ước trong đoạn văn (passage):
//   - Dòng "---"            : ngăn cách các văn bản trong đoạn đôi / đoạn ba
//   - Dòng bắt đầu bằng "|" : một hàng của bảng (hàng đầu tiên là tiêu đề)
//   - "__(131)__"           : chỗ trống của câu 131 (Part 6)
//   - "[1]" ... "[4]"       : vị trí chèn câu (Part 7)
// Mỗi câu có trường `type: 'mcq'` để sau này thêm loại câu khác.

const ABCD = ['A', 'B', 'C', 'D'];

function q(no, part, groupCode, question, options, answer, explanation) {
  const opts = {};
  options.forEach((text, i) => { opts[ABCD[i]] = text; });
  return { no, part, type: 'mcq', groupCode, question, options: opts, answer, image: null, explanation };
}

// Câu Part 6 không có đề riêng, học viên chọn đáp án cho chỗ trống trong đoạn văn
const p6 = (no, groupCode, options, answer, explanation) => q(no, 6, groupCode, '', options, answer, explanation);
const p5 = (no, question, options, answer, explanation) => q(no, 5, null, question, options, answer, explanation);
const p7 = (no, groupCode, question, options, answer, explanation) => q(no, 7, groupCode, question, options, answer, explanation);

const groups = [
  // ---------------- PART 6 ----------------
  {
    code: 'P6-01', part: 6, kind: 'text', from: 131, to: 134, passageImages: [], image: null,
    passage: `To: Olivia Paulson
From: Jonathan Hicks
Date: July 19
Subject: Procedural Review

An issue was brought up at the executives meeting last Thursday. Complaints of damaged goods after being shipped __(131)__ dramatically in the last month. This may be a result of more fragile items being added to the products we now ship. __(132)__ We are reviewing the packaging procedures for our products and are looking to add more steps to __(133)__ that the products are packaged securely and delivered without damage. Please inform the managers on the manufacturing team to attend an __(134)__ meeting tonight at 7:00 P.M. We hope to address this problem and come up with a sound solution as quickly as possible so that normal business can resume.`,
  },
  {
    code: 'P6-02', part: 6, kind: 'text', from: 135, to: 138, passageImages: [], image: null,
    passage: `Green Clean Services
Call us: 347-281-7834

__(135)__ 2005, Green Clean has been providing professional and environmentally friendly cleaning services of consistent high quality to all types of commercial and industrial facilities. __(136)__ We understand the contributions a good employee makes toward our __(137)__, and we commit to selecting the best available people to work for you.

Green Clean's mission is to satisfy our customers' needs on a daily basis while providing the best combination of quality, price, and delivery. We accomplish this by continually improving our systems of __(138)__. Our goal is to make your facility extremely clean in the greenest way possible. Visit our website today at www.greenclean.com.`,
  },
  {
    code: 'P6-03', part: 6, kind: 'text', from: 139, to: 142, passageImages: [], image: null,
    passage: `Florist Wanted

Do you love making people smile? Does the idea of __(139)__ your day being creative and working with nature appeal to you? If so, we would like to encourage you to apply to join our team at Wild Flowers Florists. __(140)__ We are looking for someone who is customer-__(141)__ first. Creativity is important, but it is secondary to the vision of the client. If you think __(142)__ have what it takes to make people smile, please fill out our online application form on our website, www.WildFlowersFlorists.com.`,
  },
  {
    code: 'P6-04', part: 6, kind: 'text', from: 143, to: 146, passageImages: [], image: null,
    passage: `October 21

Larry Mills
226 Highland Rivers
Fairbank, WA 20037

Dear Mr. Mills,

I am writing in reply to your complaint about the noise levels coming from the surrounding businesses around the apartment complex. __(143)__, a few people living on the west wing of the building __(144)__ concern over the noise levels. The building committee has conducted meetings over this issue and we have talked to the businesses. __(145)__ Because of this, we are also looking to fortify the windows with noise-proof glass for residents living on the west wing. Once we have agreed upon the proposals, we will post the announcement on our bulletin board and you may receive a call. Until then, we ask for your __(146)__ patience.`,
  },

  // ---------------- PART 7: đoạn đơn ----------------
  {
    code: 'P7-D01', part: 7, kind: 'single', from: 147, to: 148, passageImages: [], image: null,
    passage: `Henderson Inc.
1576 Stevens Road, Pleasantville, NY 10571
(231) 555-0786, www.hendersoninc.com

Order Number: 6694
Date: April 2
Customer: Susan Ward
709 Praise Street
Pleasantville, NY 10571
(203) 555-0167

| Item | Model | Quantity | Price
| Extra-large microwave | MW132 | 1 | $150.00
| Four-door refrigerator | RF4D | 1 | $2,399.99
| Smart toaster | TR512 | 1 | $45.50

Subtotal: $2,595.49
Tax: $230.18
Total due: $2,825.67

Local customers are eligible for free shipping on purchases over $1,000.`,
  },
  {
    code: 'P7-D02', part: 7, kind: 'single', from: 149, to: 150, passageImages: [], image: null,
    passage: `DAN COOPER [10:10]
Did you finish your meeting?

HEATHER BERRY [10:10]
Not yet.

DAN COOPER [10:11]
Okay, message me when you're done.

HEATHER BERRY [10:11]
I'm free now. They took a break for snacks and the bathroom.

DAN COOPER [10:13]
Great. I was wondering if you'd take the interns to lunch today.

HEATHER BERRY [10:13]
Are you bailing on it?

DAN COOPER [10:14]
I have to. I need to be in North Point by 2.

HEATHER BERRY [10:14]
No worries. I'll take them.

DAN COOPER [10:16]
Thanks. I'd hate to cancel on them.`,
  },
  {
    code: 'P7-D03', part: 7, kind: 'single', from: 151, to: 152, passageImages: [], image: null,
    passage: `Superbox Theaters

Superbox Theaters is now offering reduced prices on matinée tickets this December. Use this early-bird special and pay half the price for the first matinée show. This offer applies to all movies, seven days a week, even including our new releases!

Group visits from schools and companies are encouraged. If you have a large group, you might want to reserve your tickets in advance. Tickets can be purchased in person from theater staff or online at www.superboxtheaters.com and www.abcticketworld.com. Additionally, when buying tickets online, we offer the convenience of choosing your seat number. Information and reviews of current and upcoming films are also available on the website. Come on down to Superbox Theaters and take advantage of this great offer.`,
  },
  {
    code: 'P7-D04', part: 7, kind: 'single', from: 153, to: 154, passageImages: [], image: null,
    passage: `To: Aaron Sandler <asandler@milleradvertising.com>
From: Sam Miller <smiller@milleradvertising.com>
Subject: Tuesday's Meeting
Date: November 12

Dear Mr. Sandler,

This month's business review meeting is scheduled for Thursday, November 15. As you know, this meeting is a great opportunity for us to assess our operating plan and to make any adjustments that might help us keep up with constant changes in the marketplace. As an advertising agency, it's crucial we stay informed about the newest market trends. Therefore, I was excited when I heard that Tsuyoshi Ito, manager of our Japanese branch, would be visiting this Friday. In order to take advantage of his expertise and knowledge, I would like to change the meeting date so that Mr. Ito can attend.

This will be Mr. Ito's first time in the country, so I would like you to pick him up from the airport. A company car will be provided to you for this purpose. I will e-mail again once I have more details concerning Mr. Ito's arrival time.

Sincerely,
Sam Miller
President
Miller Advertising`,
  },
  {
    code: 'P7-D05', part: 7, kind: 'single', from: 155, to: 157, passageImages: [], image: null,
    passage: `To: Bridget Lee
From: Victor Thomas
Subject: Shipment
Date: June 25

Hello Bridget,

– [1] – Our shipment of beverages will arrive tomorrow morning around 10:00 A.M. Please keep inventory and make sure that all the shipments are accurate as they are unloaded. Also, some of the beverages will need to be refrigerated right away so please make sure that that issue is taken care of in a timely fashion. – [2] – The temperatures are expected to be high tomorrow so we'll need to get all the shipments to storage as soon as possible. – [3] – We have 2 refrigerated trucks we'll send with you and we'll have a crew waiting for your arrival at the warehouse. – [4] –

If there are any problems or you need any help with issues that arise, please contact me by phone. I'll be in the office early tomorrow.

Thanks,
Victor`,
  },
  {
    code: 'P7-D06', part: 7, kind: 'single', from: 158, to: 160, passageImages: [], image: null,
    passage: `Marigold Bakery
451 Clark Street, Ellis Town
253-555-1298

Marigold Bakery is a family-run business that has been making delicious and irresistible sweet treats for over 30 years. Our store is located in historic downtown Ellis Town and offers a warm decor and inviting atmosphere.

We offer:
- Made-to-order pastries for parties, weddings, and corporate events
- Gluten- or sugar-free refreshments and vegetarian sandwiches
- Custom cake designs

Hours:
Monday to Saturday, 9:00 A.M. to 5:00 P.M.
We will be closing this September in order to expand the size of our store.

Sunday cooking class:
Marigold Bakery values positive interactions with the community. Therefore, we are currently holding a cooking class for teenagers in the community. Baking teaches the values of patience and hard work!`,
  },
  {
    code: 'P7-D07', part: 7, kind: 'single', from: 161, to: 164, passageImages: [], image: null,
    passage: `Peter Jones [12:10]
I'm heading to the new pizza parlor across the street for lunch. Does anyone want to join me?

Martin Lee [12:10]
Count me in!

Laura Vans [12:11]
Theo and I are working on our presentation for tomorrow so we can't.

Theo Gibbs [12:12]
Can you bring back some pizza for us?

Peter Jones [12:13]
Sure. What kind of pizza do you want?

Laura Vans [12:14]
I'll take whatever their best selling pizza is. One large slice will be enough for me.

Theo Gibbs [12:15]
Pepperoni for me. One slice.

Peter Jones [12:15]
No problem. I'll be back in one hour. Is your presentation about the new product line?

Laura Vans [12:16]
Yes, we're almost finished but we're working on making the visuals more impressive.

Martin Lee [12:17]
If you'd like, I can help you with the visuals. I have a bit of a background in computer graphics.

Theo Gibbs [12:17]
That would be great. Laura and I are good with basic computer programs, but neither of us is very good at making visuals.

Peter Jones [12:18]
When Martin and I come back, we can help you finish your presentation.

Laura Vans [12:18]
Thanks so much!

Theo Gibbs [12:19]
Awesome!`,
  },
  {
    code: 'P7-D08', part: 7, kind: 'single', from: 165, to: 167, passageImages: [], image: null,
    passage: `To: All Employees <staff@jointsystems.com>
From: Fred Hanes <fhanes@jointsystems.com>
Subject: Community Park Cleanup
Date: February 12

Joint Systems is a company that tries to take every opportunity to give back to our community. Therefore, I am urging all of our employees to take part in the upcoming community park cleanup sponsored by the city of Harrisburg. Without the dedication of volunteers, our parks and public spaces would not be free of litter. Donate some of your free time to keeping Harrisburg a beautiful and inviting city.

The community park cleanup will be held next Friday, February 18, from 1:00 to 5:00 P.M. Employees who wish to participate will leave work at lunchtime, yet will still be paid as if they had worked a full day. Volunteers are asked to bring supplies such as protective outerwear, tools, insect repellent, trash bags, and snacks.

A shuttle bus will depart from the company parking lot at 1:20 P.M. on Friday to take volunteers to the volunteer location. If you have a specific preference concerning the type of work you would like to do, please contact Event Organizer Don Lewis at 435-555-6768.

We appreciate everyone's enthusiasm and support.

Fred Hanes
Human Resources, Joint Systems`,
  },
  {
    code: 'P7-D09', part: 7, kind: 'single', from: 168, to: 171, passageImages: [], image: null,
    passage: `http://www.sanchezcardealership.com/about

Sanchez Motors
ABOUT | NEWS | MODELS | SERVICES | COMMUNITY

About Sanchez Motors

Carlos Sanchez always had the dream of owning his own car dealership ever since he started working as an assistant in an auto repair shop. After saving his money for ten years, he finally opened Sanchez Motors, and has been serving the community with integrity and pride ever since. Sanchez Motors carries all kinds of vehicles, from sports cars and vans to SUVs and trucks. Not sure what car fits your needs? Then come on down and try driving a variety of vehicles to see what's right for you.

Until the end of the year, Sanchez Motors is giving you an amazing offer on our popular line of Spitfire pickup trucks and Stark SUVs. If you make a down payment of just $3,000, you will be eligible for an extremely low interest rate on your monthly installments.

Sanchez Motors is located off Highway 5, just outside of the town of Stockton. We are open 7 days a week, from 9:00 A.M. to 9:00 P.M. Don't hesitate, and come pay us a visit!`,
  },
  {
    code: 'P7-D10', part: 7, kind: 'single', from: 172, to: 175, passageImages: [], image: null,
    passage: `Clean and Green

The town of Korden has much to celebrate as the new hydrogen fuel car company, Newmark, plans to open a massive manufacturing plant in the next few months. – [1] – Newmark already supplies some of the greenest cities around the world including Vancouver, Singapore, Honolulu, and Amsterdam with hydrogen-fueled public buses and taxis. – [2] – The company is forecast to grow by 120% in the next 5 years. Furthermore, the opening of the plant in Korden is expected to bring in 300 new jobs. – [3] – The old Handai facilities will be the site of the new Newmark facilities. The mayor of Korden is also working to provide government subsidies to those who purchase a hydrogen-fueled car in hopes that the gas-guzzling conventional cars eventually become a thing of the past. – [4] –`,
  },

  // ---------------- PART 7: đoạn đôi ----------------
  {
    code: 'P7-DD01', part: 7, kind: 'double', from: 176, to: 180, passageImages: [], image: null,
    passage: `From: Kevin Draper <kdraper@fivestarbank.com>
To: Sam Brown <sbrown@zippy.com>
Date: April 22
Subject: Home Loan

Dear Mr. Brown,

Thank you for choosing Five Star Financial Bank as the provider of your home loan. We strive to offer you the most competitive repayment plans as well as superb customer support. Below is a summary of the loan you have taken out with us.

| Mortgage Type | Amount | Repayment Period
| Home Opportunity Loan | $70,000.00 | 15 years

During the period of your loan, senior banker Martha King will be in charge of your repayment plan. Understanding the terms of your loan is crucial to successfully paying back your loan and avoiding penalties. We advise you to schedule a time to meet with Ms. King so she can help to further familiarize you with your home loan.

If you sign up for our online banking services, you will be able to quickly and conveniently check on your repayment progress.

Thanks again for trusting Five Star Financial Bank with your home loan.

Sincerely,
Kevin Draper
Loan Specialist
Five Star Financial Bank
---
Listed below are the various home loans available to members of Five Star Financial Bank. Learning about different kinds of loans will help you make an informed decision. Review the loan choices below and decide which loan is right for your situation.

Fixed-Rate Mortgage Loan – This loan ensures that your interest rate and monthly principal repayment remain the same during the entire period of your loan. This loan protects you from rising interest rates and may be a good choice if you plan to live in your home for a long time.

Adjustable-Rate Mortgage Loan – Your interest rate remains fixed for the initial 5 years, and then is adjusted annually. Typically, this loan has a lower initial interest rate than on a fixed-rate mortgage.

Interest-Only Mortgage Loan – During the initial 5 years of the loan, you are required to make payments on interest only. This option is suitable for those with fluctuating incomes. When your finances are tight, you can make the interest-only payment. And when your earnings increase, you can make payments on principal.

Home Opportunity Loan – This special loan is designed for first-time home buyers. You do not need a large down payment and a perfect credit rating in order to qualify for this loan.`,
  },
  {
    code: 'P7-DD02', part: 7, kind: 'double', from: 181, to: 185, passageImages: [], image: null,
    passage: `Madison Business Update

November 15 — Sun Microchips is the largest producer in the country of the integrated circuits that go into computers, smartphones, and other digital electronics. The company has recently built a new factory in Madison and will begin operations starting in January of next year. The chief executive officer of Sun Microchips, Melinda Piers, stated that, "As the market for consumer electronics continues to become larger and larger globally, companies like Sun Microchips are expanding to meet the needs."

"We are looking to hire a variety of people such as factory workers, personnel employees, and accountants. We expect the opening of the factory to create over 200 jobs in Madison," said Ms. Piers. She noted that the company will try to hire local applicants first, but that those living outside of Madison are also encouraged to apply.

Applicants must submit their résumé by November 25 by e-mailing Tina Zimmerman at tzimmerman@sunmicrochips.com. Sun Microchips will be holding interviews next month on two separate dates. Those applying as general laborers for jobs on the assembly line should schedule an interview between December 3 and 8. Those interested in positions in personnel, accounting, and customer service are required to schedule an interview between December 9 and 11.
---
To: Tina Zimmerman <tzimmerman@sunmicrochips.com>
From: Jake Henry <jakehenry@tnamail.com>
Date: November 21
Subject: Opening at Sun Microchips
Attachment: résumé.doc

Dear Ms. Zimmerman,

I recently read an article in the Madison Business Update about the openings at a new factory in Madison. As a former employee of Sun Microchips, I was excited by the prospect of joining your company again.

Please see the attached file. I would really appreciate it if you would give me a chance to have an interview. Anytime on December 10 will work for me. If you would like to learn more about my past work experience with Sun Microchips, you can contact my former supervisor, Todd Smith. He is still working there.

I look forward to meeting you.

Jake Henry`,
  },

  // ---------------- PART 7: đoạn ba ----------------
  {
    code: 'P7-DB01', part: 7, kind: 'triple', from: 186, to: 190, passageImages: [], image: null,
    passage: `From: Henry Choi <henrychoi@neatsolutions.com>
To: Jenny Davis <jennydavis@tmgolf.com>
Date: August 8
Subject: Endless Acres Golf Club
Attachment: draft

Dear Ms. Davis,

Attached is the newest draft of the advertisement for Endless Acres Golf Club. I have incorporated the advertising slogan you sent me into my design. I used a combination of eye-catching graphics to grab the attention of newspaper readers. I also added some helpful information to the end of the advertisement. Please let me know if the design and new additions meet your expectations. Along with the concurrent television ad, I think this advertisement will help bring a lot of new customers to Endless Acres Golf Club.

Sincerely,
Henry Choi
---
Endless Acres Golf Club
1232 Hilly Meadows Drive, Mapleview, CO

Take a break from all the stress of life and play a round of relaxing golf at Endless Acres Golf Club. After a game of golf, enjoy a meal at our restaurant in a sophisticated and welcoming environment.

We are currently offering the following promotion:
Reserve a tee time for a party of seven or more golfers and receive 20% off. Additionally, every member of your group will receive a coupon for $5 off any purchase from our golf shop.

We were recently praised by The Rolling Meadows Daily for the superb maintenance of our golf course and grounds. Come in and enjoy the best golf course in the state of Colorado. We are located off exit 21 on Highway 5. Just look for our billboard. You can't miss it!

Reservations can now be made online at our website at www.endlessacresgolf.com or by calling 555-4834.
---
From: Logan Mankins <lmankins@crushing.com>
To: reservations@endlessacresgolfclub.com
Date: July 6
Subject: Re: Tee Time and Dinner for 10

Hello,

I saw your ad in the newspaper and I have a couple quick questions about your deals. First, we have a group of ten golfers. Now I know most courses generally limit a group to four players to keep up the pace of play, but I was really hoping you could make an exception for us and allow two groups of five. We will even rent golf carts to ensure that we don't cause a delay. As for the $5 gift cards to the pro shop, I was wondering if they could be pooled together for one large purchase. It is my son's birthday and I would like to buy him a new putter and they are awfully expensive these days. $50 bucks could go a long way to giving him a great gift!

We would like to tee off around 11:30 A.M. on Saturday, July 20th, and then have dinner there at about 6:00 P.M. Please write back to confirm our tee time and answer my queries. Thank you for your time!

Have a great day,
Logan Mankins`,
  },
  {
    code: 'P7-DB02', part: 7, kind: 'triple', from: 191, to: 195, passageImages: [], image: null,
    passage: `To: Library Members <members@claytonlibrary.edu>
From: Holly Allen <hollyallen@claytonlibrary.edu>
Subject: Events This Month
Date: August 1
Attachment: August Event Calendar

Dear Members of the Clayton Library,

Thank you for your continued support of the Clayton Library. Your monthly membership fees help us to obtain new books, computers, journal subscriptions, and other resources that are useful to the entire community. We would like to inform you of some special upcoming events this month you may be interested in attending.

First, famous children's book author and storyteller Ebert Butler will be visiting our library. He will be reading from his new book, The Mysterious Cat, and signing autographs. His book was recently nominated for the Children's Book of the Year Award. Kathy Butler, Mr. Butler's wife, will also be in attendance at this event. She has drawn the pictures in most of Mr. Butler's books, including The Mysterious Cat. This event costs $10 but is provided free for library members.

Later in the month, renowned wildlife photographer Nina Brooks will be holding an exhibition on the main floor of the library. Ms. Brooks recently returned from a trip to Kenya, where she photographed cheetahs, giraffes, elephants, and other animals. Her photographs capture the vividness of the wildlife and the majesty of nature.

In addition to these two featured events, there will be a variety of workshops, games nights, and other events this month. Check the attached calendar for details. All events, including Movie Night, are free unless noted otherwise.

Sincerely,
Holly Allen
Library Events Coordinator
---
Clayton Library Events Calendar – August

| Date/Time | Event Title | Notes
| Saturday, Aug. 2, 5:00 P.M. | Creative Writers Workshop | Led by Donna Ward
| Friday, Aug. 8, 7:00 P.M. | Movie Night | Family-friendly event
| Sunday, Aug. 17, 6:00 P.M. | The Mysterious Cat Reading | Entrance cost of $10
| Wednesday, Aug. 20, 3:00 P.M. | Knitting Club | Complimentary refreshments
| Saturday, Aug. 30, 2:00 P.M. | Photo Exhibition Opening | Entrance cost of $5
---
Clayton Library Community Chat Board

August 1

User ID: jjohnson231
Subject: Creative Writers Workshop August 2
Hey, is anybody going to go to the writers workshop tomorrow? I heard that Donna Ward is an outstanding teacher. I could really use some feedback on my latest short story too. Post if you are going! ~Jim

User ID: Storytimechuck
Subject: Re: Creative Writers Workshop August 2
Hey jjohnson231! I am going for sure. You are right, Donna is the best. Her knowledge of narrative and pacing have really helped me with my screenplay. Maybe I could read through your short story after the workshop and give you my feedback too? The more eyes the better, I always say! I'll let you take a look through my screenplay too if you are interested. See you tomorrow!! ~Chuck`,
  },
  {
    code: 'P7-DB03', part: 7, kind: 'triple', from: 196, to: 200, passageImages: [], image: null,
    passage: `Red Rock Leather Goods

Thank you for purchasing a leather product from Red Rock Leather Goods. We manufacture all of our products to meet the highest quality standards and pride ourselves on excellent customer service. All of our products are individually and meticulously made by skillful craftsmen. We offer a lifetime guarantee that covers all defects in craftsmanship except normal wear and tear. We will repair or replace any pieces due to our fault for as long as you own your Red Rock product.

If your Red Rock product is not under warranty, we offer repairs at the following rates:

| | Wallets | Handbags | Jackets
| Missing button repair | $10 | $15 | $20
| Zipper repair and replacement | $20 | $30 | $45
| Seam repair and stitching | $40 | $50 | $60

The warranty is non-transferable and covers only the original purchaser. Additionally, the sales receipt is necessary to validate your warranty and receive service. This warranty does not apply to products purchased from second-hand stores or unauthorized dealers.
---
Repair Request Form

Name: Melisa Perkins
Date: February 28
Address: 458 Center Circle Drive, Chicago, IL
Product: Coco TX Handbag

Description of repairs to be made:
I bought this item last year from a Red Rock Leather Goods store in Chicago, IL. However, after just six months, the zipper became jammed and no longer opens or closes. Because this is a manufacturing defect, I assume it will be covered by the warranty. I have been a regular customer of Red Rock Leather Goods for 12 years, and this is the first time I have had a problem.

Signature: Melisa Perkins
Date: February 28

Note: It may take some time for your product to be returned to you. If you have any questions, please call us at 812-555-8541.
---
Dear Melisa Perkins,

Thank you for submitting your request for repairs to your Red Rock Leather Goods Coco TX Handbag. We have received and inspected your item and documents and concluded that it falls within our warranty. It is scheduled to go in for repair this coming week. Once it has been returned to working order, we will express mail it to the address you provided in your Repair Request Form. I would like to thank you on behalf of Red Rock Leather Goods for your 12 years of patronage and apologize for any inconvenience the failure of your Coco TX Handbag has caused you.

Sincerely,
Cheryl Timmins
Customer Service Specialist
Red Rock Leather Goods`,
  },
];

const questions = [
  // ---------------- PART 5 ----------------
  p5(101, 'Pet owners are encouraged to register ------- the workshop on pet training and health offered by the community center.',
    ['of', 'from', 'in', 'for'], 'D',
    'Cụm cố định "register for + sự kiện" = đăng ký tham gia. Dịch: Chủ thú cưng được khuyến khích đăng ký buổi hội thảo về huấn luyện và sức khỏe thú cưng.'),
  p5(102, "The CEO held a press conference to ------- for the negative health effects caused by her company's products.",
    ['apologized', 'apologize', 'apologizes', 'apologizing'], 'B',
    '"to" ở đây chỉ mục đích (để làm gì), sau "to" cần động từ nguyên mẫu: to apologize for = để xin lỗi vì.'),
  p5(103, "There is a ------- difference between the business's revenues during the peak season compared to the off-peak season.",
    ['prosperous', 'rural', 'significant', 'preparatory'], 'C',
    '"significant difference" = sự khác biệt đáng kể. prosperous (thịnh vượng), rural (nông thôn), preparatory (để chuẩn bị) không hợp nghĩa.'),
  p5(104, 'The path through Morrison Park was constructed not only for cyclists ------- joggers.',
    ['but also', 'though', 'in addition to', 'neither'], 'A',
    'Cấu trúc cặp "not only ... but also ..." = không chỉ ... mà còn .... Con đường được xây không chỉ cho người đi xe đạp mà còn cho người chạy bộ.'),
  p5(105, 'One of the supervisors questioned Ms. Marshall ------- her role in the misuse of the investment funds.',
    ['unless', 'among', 'about', 'into'], 'C',
    '"question somebody about something" = chất vấn ai về việc gì. Người giám sát chất vấn cô Marshall về vai trò của cô trong việc dùng sai quỹ đầu tư.'),
  p5(106, 'The occupancy rate at Starburst Hotel has------- by 24% due to increased competition.',
    ['relied', 'fallen', 'expired', 'coincided'], 'B',
    '"has fallen by 24%" = đã giảm 24% (vì cạnh tranh tăng). relied (dựa vào), expired (hết hạn), coincided (trùng khớp) không hợp nghĩa và không đi với "by + %".'),
  p5(107, 'A certificate of ------- was given to the participants in the public speaking skills course.',
    ['accomplishment', 'accomplish', 'accomplished', 'accomplishing'], 'A',
    'Sau giới từ "of" cần danh từ: certificate of accomplishment = giấy chứng nhận hoàn thành khóa học.'),
  p5(108, 'The chef ------- prepares the entree for a restaurant critic often comes out to greet him or her in person.',
    ['whose', 'what', 'either', 'who'], 'D',
    'Cần đại từ quan hệ chỉ người, làm chủ ngữ cho động từ "prepares": The chef who prepares ... "whose" phải đi kèm danh từ phía sau; "what" không bổ nghĩa cho danh từ.'),
  p5(109, 'The negotiators made a few minor changes to the contract to make the terms ------- to both parties.',
    ['agreeable', 'agreement', 'agree', 'agreeing'], 'A',
    'Cấu trúc "make + tân ngữ + tính từ": make the terms agreeable to both parties = làm cho các điều khoản được cả hai bên chấp nhận.'),
  p5(110, 'The allocation of funds to local schools is ------- on the number of children living in the district.',
    ['seen', 'based', 'placed', 'taken'], 'B',
    '"be based on" = dựa trên. Việc phân bổ ngân sách cho trường học dựa trên số trẻ em sống trong quận.'),
  p5(111, 'This palace was ------- used for public ceremonies and celebrations.',
    ['traditionally', 'traditional', 'tradition', 'traditions'], 'A',
    'Vị trí giữa "was" và quá khứ phân từ "used" cần trạng từ: was traditionally used = theo truyền thống được dùng cho các nghi lễ.'),
  p5(112, 'The successful candidate will be contacted by an HR representative once the hiring committee makes its ------- decision.',
    ['disposable', 'numerous', 'final', 'portable'], 'C',
    '"final decision" = quyết định cuối cùng. disposable (dùng một lần), numerous (nhiều — cần danh từ số nhiều), portable (xách tay) không hợp nghĩa.'),
  p5(113, 'The chairperson ------- by an anonymous vote involving all members.',
    ['has been selecting', 'had to select', 'is selecting', 'will be selected'], 'D',
    'Chủ tịch "được chọn" bởi một cuộc bỏ phiếu (có "by") → cần thể bị động: will be selected. Các phương án còn lại đều là chủ động.'),
  p5(114, 'Providing low-interest loans to small businesses is a key ------- of the recovery plan.',
    ['vacancy', 'status', 'component', 'rate'], 'C',
    '"a key component of the plan" = một thành phần then chốt của kế hoạch phục hồi. vacancy (vị trí trống), status (tình trạng), rate (tỷ lệ) không hợp nghĩa.'),
  p5(115, "The project would not have been a success without Mr. Ratcliffe's complete -------, which was demonstrated on several occasions.",
    ['dedicated', 'dedicate', 'dedicates', 'dedication'], 'D',
    'Sau sở hữu cách "Mr. Ratcliffe\'s" và tính từ "complete" cần danh từ: complete dedication = sự tận tụy hết mình.'),
  p5(116, 'City politicians will debate the ------- issue at the town hall meeting so that voters can have a better understanding of it.',
    ['competent', 'observant', 'complicated', 'indecisive'], 'C',
    '"complicated issue" = vấn đề phức tạp, cần tranh luận để cử tri hiểu rõ hơn. competent (có năng lực), observant (tinh ý), indecisive (do dự) dùng cho người.'),
  p5(117, '------ the hospital experiences a power outage, power generators will turn on automatically to supply the necessary electricity.',
    ['If', 'Until', 'What', 'So'], 'A',
    '"If" = nếu: Nếu bệnh viện bị mất điện, máy phát sẽ tự động bật. Until (cho đến khi) không hợp nghĩa; What, So không nối được hai mệnh đề theo cách này.'),
  p5(118, 'After the tellers at Stewart Bank underwent extensive training, they treated the customers -------.',
    ['more courteously', 'courteous', 'most courteous', 'courtesy'], 'A',
    'Bổ nghĩa cho động từ "treated" cần trạng từ: more courteously = lịch sự hơn (so với trước khi được đào tạo).'),
  p5(119, 'A gate agent at the airport announced a flight ------- caused by severe weather at the destination.',
    ['canceling', 'cancels', 'cancellation', 'cancel'], 'C',
    'Sau "a flight" cần danh từ tạo thành danh từ ghép: a flight cancellation = việc hủy chuyến bay (do thời tiết xấu).'),
  p5(120, '------- the outdated equipment is replaced with state-of-the-art machinery, productivity will more than double.',
    ['Whether', 'Later', 'When', 'Momentarily'], 'C',
    '"When" = khi: Khi thiết bị cũ được thay bằng máy móc hiện đại, năng suất sẽ tăng hơn gấp đôi. Whether cần đi với "or"; Later, Momentarily là trạng từ, không nối hai mệnh đề.'),
  p5(121, 'In order to be eligible for this position, you must have at least five years of experience in the insurance-------.',
    ['preservation', 'figure', 'industry', 'description'], 'C',
    '"the insurance industry" = ngành bảo hiểm. Cần ít nhất 5 năm kinh nghiệm trong ngành bảo hiểm.'),
  p5(122, 'Through his extensive research into acquiring language skills, Dr. Harvey Ward has proven ------- to be a leader in the field.',
    ['he', 'his', 'himself', 'him'], 'C',
    '"prove oneself to be" = chứng tỏ bản thân là. Tân ngữ chính là chủ ngữ (Dr. Harvey Ward) nên dùng đại từ phản thân himself.'),
  p5(123, 'The seafood sold by Pacific Plus is ------- and therefore must be transported in a temperature-controlled vehicle.',
    ['suitable', 'widespread', 'cautious', 'perishable'], 'D',
    '"perishable" = dễ hư hỏng, vì vậy phải chở bằng xe kiểm soát nhiệt độ. suitable (phù hợp), widespread (phổ biến), cautious (thận trọng) không giải thích được vế sau.'),
  p5(124, 'The novelist said that his writing was ------- influenced by the late writer Edward Truitt.',
    ['manually', 'insecurely', 'regretfully', 'profoundly'], 'D',
    '"profoundly influenced" = chịu ảnh hưởng sâu sắc. manually (bằng tay), insecurely (không an toàn), regretfully (đáng tiếc) không hợp nghĩa.'),
  p5(125, 'As ------- by the researchers, the new environmentally friendly laundry detergent performed as well as its competitors.',
    ['observing', 'observed', 'observation', 'observe'], 'B',
    '"As observed by the researchers" = như các nhà nghiên cứu đã quan sát (rút gọn bị động của "As it was observed by"). Có "by" nên cần quá khứ phân từ.'),
  p5(126, 'The Green Society is dedicated to ------- public parks and other natural areas for future generations.',
    ['preserving', 'consulting', 'escorting', 'inquiring'], 'A',
    '"be dedicated to + V-ing" (to là giới từ). preserving = bảo tồn công viên và khu tự nhiên cho thế hệ sau. consulting, escorting, inquiring không hợp nghĩa.'),
  p5(127, 'The manufacturing plant that was damaged in the typhoon should ------- its operations later this month.',
    ['resumed', 'be resuming', 'had resumed', 'resuming'], 'B',
    'Sau động từ khuyết thiếu "should" phải là động từ nguyên mẫu: should be resuming = sẽ hoạt động trở lại. Các phương án khác không đứng sau "should" được.'),
  p5(128, "Because the team was already behind schedule, the manager did not ------- to Ms. Norton's vacation request.",
    ['accept', 'ensure', 'consent', 'finalize'], 'C',
    '"consent to something" = đồng ý với điều gì. "accept" cũng có nghĩa đồng ý nhưng không đi với giới từ "to" (accept the request).'),
  p5(129, 'The nasal spray allowed Bert to keep his seasonal allergies ------- control without having to get a prescription.',
    ['against', 'under', 'around', 'unto'], 'B',
    'Cụm cố định "keep something under control" = kiểm soát được điều gì. Thuốc xịt mũi giúp Bert kiểm soát dị ứng theo mùa.'),
  p5(130, 'Sales ------- unavailable to take your call at the moment will call you back as soon as possible.',
    ['representation', 'represents', 'representatives', 'representative'], 'C',
    'Cần danh từ chỉ người, số nhiều (không có mạo từ) làm chủ ngữ cho "will call you back": Sales representatives = các nhân viên bán hàng. "representative" số ít cần có mạo từ "a/the".'),

  // ---------------- PART 6 ----------------
  p6(131, 'P6-01', ['increasing', 'have increased', 'were increased', 'increases'], 'B',
    '"in the last month" (trong tháng vừa qua) là dấu hiệu thì hiện tại hoàn thành. Chủ ngữ "Complaints" số nhiều → have increased. "increase" ở đây là nội động từ nên không dùng bị động "were increased".'),
  p6(132, 'P6-01', [
    'We are thinking of dropping such items from our product list.',
    'We may need to increase the shipping and handling cost.',
    'An added insurance cost for such items has been suggested.',
    'Because of this, we have temporarily suspended the shipping of accessories and other fragile items.',
  ], 'D',
    'Câu trước nói nguyên nhân có thể là do thêm nhiều hàng dễ vỡ → câu D "Vì vậy, chúng tôi tạm ngừng gửi phụ kiện và hàng dễ vỡ" là hệ quả hợp lý, sau đó mới nói đang xem lại quy trình đóng gói. Các câu A, B, C không khớp với việc đang xem lại cách đóng gói.'),
  p6(133, 'P6-01', ['secure', 'affect', 'ensure', 'warrant'], 'C',
    '"ensure that + mệnh đề" = đảm bảo rằng sản phẩm được đóng gói chắc chắn. secure, affect, warrant không đi với mệnh đề "that" theo nghĩa này.'),
  p6(134, 'P6-01', ['emergency', 'necessity', 'decisive', 'extensive'], 'A',
    '"an emergency meeting" = cuộc họp khẩn cấp, phù hợp với việc họp ngay tối nay và muốn giải quyết "as quickly as possible". Sau mạo từ "an" cũng cần từ bắt đầu bằng nguyên âm.'),
  p6(135, 'P6-02', ['Until', 'Around', 'Since', 'Through'], 'C',
    '"Since 2005" + thì hiện tại hoàn thành tiếp diễn "has been providing" = từ năm 2005 đến nay.'),
  p6(136, 'P6-02', [
    'Drop in today to schedule a tour of one of our twenty facilities.',
    'We are the biggest manufacturer of environmentally friendly cleaning supplies in the Northwest.',
    'As a service company, we consider our employees to be our most important asset.',
    'Allow us to work for you by calling us today to take care of all of your accounting needs.',
  ], 'C',
    'Câu sau nói "Chúng tôi hiểu những đóng góp của một nhân viên giỏi..." → câu trước phải nói về nhân viên: "Là công ty dịch vụ, chúng tôi coi nhân viên là tài sản quan trọng nhất". B sai (công ty làm dịch vụ vệ sinh, không phải sản xuất), D sai (kế toán), A không liên quan.'),
  p6(137, 'P6-02', ['success', 'drive', 'support', 'determination'], 'A',
    '"the contributions a good employee makes toward our success" = những đóng góp của nhân viên giỏi cho thành công của chúng tôi.'),
  p6(138, 'P6-02', ['to operate', 'operates', 'operated', 'operation'], 'D',
    'Sau giới từ "of" cần danh từ: systems of operation = hệ thống vận hành.'),
  p6(139, 'P6-03', ['spend', 'to spend', 'spending', 'spent'], 'C',
    'Sau giới từ "of" động từ phải ở dạng V-ing: the idea of spending your day = ý tưởng dành cả ngày (sáng tạo và làm việc với thiên nhiên).'),
  p6(140, 'P6-03', [
    'You must be good with animals.',
    'Our company is committed to providing the best floral arrangements for our clients, no matter what their needs.',
    'We use the best fabrics in our designs.',
    'All people love our commitment to safety.',
  ], 'B',
    'Tin tuyển thợ cắm hoa, câu sau nói cần người đặt khách hàng lên hàng đầu → B "Công ty cam kết mang đến cách cắm hoa tốt nhất cho khách, dù nhu cầu là gì" nối ý hợp lý. Động vật (A), vải (C), an toàn (D) không liên quan tiệm hoa.'),
  p6(141, 'P6-03', ['oriented', 'prime', 'located', 'sourced'], 'A',
    '"customer-oriented" = hướng tới khách hàng. Câu sau giải thích: sáng tạo quan trọng nhưng xếp sau mong muốn của khách.'),
  p6(142, 'P6-03', ['you', 'I', 'they', 'we'], 'A',
    'Cả bài nói trực tiếp với người đọc ("Do you love...", "appeal to you") → If you think you have what it takes = nếu bạn nghĩ mình có đủ khả năng.'),
  p6(143, 'P6-04', ['As a result', 'Moreover', 'On the other hand', 'Unfortunately'], 'D',
    '"Unfortunately" = không may là: một số cư dân cánh tây cũng phàn nàn về tiếng ồn — thông báo tin không vui, nối tiếp lời phàn nàn của ông Mills. As a result (kết quả là), Moreover (hơn nữa), On the other hand (mặt khác) không hợp logic.'),
  p6(144, 'P6-04', ['is expressing', 'have expressed', 'expression', 'be expressive'], 'B',
    'Chủ ngữ "a few people" số nhiều → have expressed concern = đã bày tỏ lo ngại. "is expressing" chia số ít; "expression", "be expressive" không làm động từ chính được.'),
  p6(145, 'P6-04', [
    'However, some of the noises are inevitable due to the nature of the businesses.',
    'They will fully cooperate with our committee.',
    'They have responded to our concerns and will work to keep noise levels low.',
    'However, they are losing money over this matter.',
  ], 'A',
    'Câu sau "Because of this, we are also looking to fortify the windows with noise-proof glass" (Vì vậy chúng tôi lắp thêm kính cách âm) → câu trước phải là lý do cần lắp kính: "Tuy nhiên, một số tiếng ồn là không tránh được do tính chất kinh doanh". B, C không giải thích được vì sao vẫn phải lắp kính; D không liên quan.'),
  p6(146, 'P6-04', ['continue', 'continues', 'continued', 'be continuing'], 'C',
    'Trước danh từ "patience" cần tính từ: your continued patience = sự kiên nhẫn tiếp tục của ông (cụm lịch sự thường gặp trong thư).'),

  // ---------------- PART 7 ----------------
  p7(147, 'P7-D01', 'What does Henderson Inc. sell?',
    ['Home appliances', 'Office furniture', 'Computer equipment', 'Construction materials'], 'A',
    'Đơn hàng gồm lò vi sóng (microwave), tủ lạnh (refrigerator), máy nướng bánh (toaster) → đều là đồ gia dụng (home appliances).'),
  p7(148, 'P7-D01', 'What is indicated about Ms. Ward?',
    ['She must pick up her items in person.', 'She is eligible for a special discount.', 'She will receive her deliveries at no charge.', 'She paid with a check.'], 'C',
    'Bà Ward sống ở Pleasantville, cùng thành phố với cửa hàng (khách địa phương) và mua $2,825.67, trên $1,000 → theo dòng cuối: "Local customers are eligible for free shipping on purchases over $1,000" → được giao hàng miễn phí.'),
  p7(149, 'P7-D02', 'What is suggested about Ms. Berry?',
    ['She is eating a snack.', 'She will be promoted.', 'She is in the middle of meetings.', 'She plans on cancelling a lunch appointment.'], 'C',
    'Bà Berry nói chưa họp xong ("Not yet"), giờ rảnh vì "They took a break for snacks and the bathroom" → cuộc họp chỉ tạm nghỉ, bà vẫn đang giữa buổi họp. Bà không nói mình đang ăn (A); người hủy hẹn ăn trưa là ông Cooper (D).'),
  p7(150, 'P7-D02', 'At 10:13, what does Ms. Berry mean when she writes, "Are you bailing on it?"',
    ["She's asking if Mr. Cooper has finished his meeting.", "She's inquiring if Mr. Cooper will be missing the appointment.", 'She wants to know if Mr. Cooper will go to North Point.', 'She would like Mr. Cooper to notify her when he leaves.'], 'B',
    '"bail on something" = bỏ, không tham gia việc đã hẹn. Ông Cooper nhờ bà dẫn thực tập sinh đi ăn trưa, bà hỏi ông có bỏ buổi đó không; ông trả lời "I have to" vì phải đến North Point.'),
  p7(151, 'P7-D03', 'What is indicated about Superbox Theaters?',
    ['It will screen fewer films this December.', 'It is hiring part-timers.', 'It will be adding a new theater location.', 'It is providing lower prices on certain screenings.'], 'D',
    '"offering reduced prices on matinée tickets" = giảm giá vé các suất chiếu sớm (matinée) → giá thấp hơn cho một số suất chiếu.'),
  p7(152, 'P7-D03', 'What are customers able to do on the Web site?',
    ['Demand a refund', 'Select a seat location', 'Sign up for a newsletter', 'Renew their membership'], 'B',
    '"when buying tickets online, we offer the convenience of choosing your seat number" → mua vé trên mạng thì chọn được chỗ ngồi.'),
  p7(153, 'P7-D04', 'What is the purpose of the e-mail?',
    ['To reschedule a meeting', 'To request a monthly operating report', 'To introduce a new employee', 'To propose a new marketing strategy'], 'A',
    '"I would like to change the meeting date so that Mr. Ito can attend" → mục đích là đổi lịch cuộc họp.'),
  p7(154, 'P7-D04', 'What does the e-mail indicate about Mr. Ito?',
    ['He is changing positions.', 'He often travels for business.', 'He works in advertising.', "He is a client of Mr. Miller's."], 'C',
    'Ông Ito là "manager of our Japanese branch" của Miller Advertising — một công ty quảng cáo ("As an advertising agency") → ông làm trong ngành quảng cáo. B sai vì đây là lần đầu ông đến nước này.'),
  p7(155, 'P7-D05', 'What is the purpose of the email?',
    ['To inform the suppliers of a mistake', 'To give an employee instructions', 'To order a shipment of beverages', 'To keep inventory of products'], 'B',
    'Victor dặn Bridget kiểm hàng, đảm bảo đồ uống được làm lạnh ngay, nói sẽ có xe lạnh và đội nhân viên chờ → email hướng dẫn công việc cho nhân viên.'),
  p7(156, 'P7-D05', 'Why is Victor concerned about the shipment?',
    ['The products are fragile.', 'They may arrive late.', 'They are temperature sensitive.', 'They are for an important client.'], 'C',
    'Một số đồ uống "need to be refrigerated right away" và "The temperatures are expected to be high tomorrow" → hàng nhạy cảm với nhiệt độ.'),
  p7(157, 'P7-D05', 'In which of the positions marked [1], [2], [3] and [4] does the following sentence belong? "I\'m worried about the weather."',
    ['[1]', '[2]', '[3]', '[4]'], 'B',
    'Đặt ở [2]: "Tôi lo về thời tiết." ngay trước câu giải thích "Ngày mai trời được dự báo sẽ nóng nên cần đưa hàng vào kho càng sớm càng tốt".'),
  p7(158, 'P7-D06', 'What is mentioned about Marigold Bakery?',
    ['It is internationally known.', 'It employs local students.', 'It offers options for those with dietary restrictions.', 'Its store space can be rented for various events.'], 'C',
    '"Gluten- or sugar-free refreshments and vegetarian sandwiches" → có món không gluten, không đường, món chay cho người ăn kiêng. D sai: tiệm nhận làm bánh cho tiệc chứ không cho thuê mặt bằng.'),
  p7(159, 'P7-D06', 'According to the advertisement, what will happen in September?',
    ['The store will shut down for renovations.', 'A classroom will be constructed.', 'The menu will be expanded.', 'The shop will cater a community event.'], 'A',
    '"We will be closing this September in order to expand the size of our store" → tháng 9 đóng cửa để mở rộng, cải tạo cửa hàng. C sai: mở rộng cửa hàng chứ không phải thực đơn.'),
  p7(160, 'P7-D06', 'What is indicated about the cooking class?',
    ['It will be held at a community center this year.', 'It has been going on for over 30 years.', 'It is taught by an experienced baker.', 'It is designed for local teenagers.'], 'D',
    '"a cooking class for teenagers in the community" → lớp dành cho thanh thiếu niên địa phương. "30 năm" là tuổi của tiệm bánh, không phải của lớp học (B).'),
  p7(161, 'P7-D07', 'Where most likely are the speakers?',
    ['At a restaurant', 'At a pizza shop', 'At a company', 'In an electronics shop'], 'C',
    'Họ rủ nhau ra quán pizza bên kia đường ăn trưa, đang làm bài thuyết trình về dòng sản phẩm mới → họ là đồng nghiệp, đang ở công ty.'),
  p7(162, 'P7-D07', 'At 12:10, what does Martin Lee mean when he says, "Count me in!"?',
    ["He's doing a presentation.", "He's in his office.", 'He would like to go out for lunch.', "He's currently in a meeting."], 'C',
    '"Count me in!" = tính cả tôi vào. Peter hỏi có ai đi ăn trưa cùng không, Martin trả lời là muốn đi cùng.'),
  p7(163, 'P7-D07', 'What is indicated about the presentation?',
    ['It will be presented after lunch.', 'It is about new products.', 'It is very long.', 'It needs more information.'], 'B',
    'Peter hỏi "Is your presentation about the new product line?" và Laura trả lời "Yes". A sai: bài thuyết trình vào ngày mai ("for tomorrow").'),
  p7(164, 'P7-D07', 'What will Martin Lee most likely help the presenters with?',
    ['Their graphics', 'Their information', 'Their computer use', 'Their presentation format'], 'A',
    'Martin nói "I can help you with the visuals. I have a bit of a background in computer graphics" → giúp phần hình ảnh, đồ họa.'),
  p7(165, 'P7-D08', 'What is the purpose of the e-mail?',
    ['To organize a business trip', 'To request updated information', 'To offer additional skills training', 'To promote a community event'], 'D',
    'Email kêu gọi nhân viên tham gia buổi dọn dẹp công viên của thành phố ("I am urging all of our employees to take part...") → quảng bá một sự kiện cộng đồng.'),
  p7(166, 'P7-D08', 'What would probably NOT be necessary for participants?',
    ['A company uniform', 'A mosquito spray can', 'A rake', 'A sandwich'], 'A',
    'Cần mang: đồ bảo hộ, dụng cụ (cái cào - rake), thuốc chống côn trùng (bình xịt muỗi), đồ ăn nhẹ (bánh mì). Đồng phục công ty không được nhắc tới → không cần.'),
  p7(167, 'P7-D08', 'According to the e-mail, what is Mr. Lewis responsible for?',
    ['Raising awareness about food waste', 'Analyzing customer feedback', 'Assigning individuals tasks', 'Cleaning a community center'], 'C',
    'Ai muốn chọn loại công việc thì liên hệ "Event Organizer Don Lewis" → ông Lewis là người phân công việc cho từng người.'),
  p7(168, 'P7-D09', 'What is indicated about Mr. Sanchez?',
    ['He works at an auto repair shop.', 'He started his own business.', 'He is a race car driver.', 'He designs a variety of vehicles.'], 'B',
    'Ông Sanchez tiết kiệm 10 năm rồi "finally opened Sanchez Motors" → tự mở doanh nghiệp. A sai: làm ở tiệm sửa xe là công việc trước đây.'),
  p7(169, 'P7-D09', 'The word "carries" in paragraph 1 is closest in meaning to',
    ['moves', 'manufactures', 'sells', 'develops'], 'C',
    '"Sanchez Motors carries all kinds of vehicles" = đại lý có bán đủ loại xe. Với cửa hàng, "carry" nghĩa là có hàng để bán → sells.'),
  p7(170, 'P7-D09', 'What is suggested about Sanchez Motors?',
    ['It allows customers to test products.', 'It operates a store in downtown Stockton.', 'It offers vehicle customization.', 'It closes on weekends.'], 'A',
    '"come on down and try driving a variety of vehicles" → khách được lái thử xe. B sai (ở ngoài thị trấn Stockton), D sai (mở cửa 7 ngày/tuần).'),
  p7(171, 'P7-D09', 'What is available to customers until the end of the year?',
    ['Discounts on sports cars and vans', 'An extended warranty at no extra cost', 'A special payment option', 'A free oil change with any purchase'], 'C',
    'Đến cuối năm: đặt cọc $3,000 thì được lãi suất trả góp rất thấp → một hình thức thanh toán đặc biệt. Ưu đãi áp dụng cho xe bán tải và SUV, không phải xe thể thao và xe van (A).'),
  p7(172, 'P7-D10', 'What is the main topic of the article?',
    ['Alternative energy sources', 'Environmentally friendly cities', 'The opening of a new factory', 'The future of car companies'], 'C',
    'Bài báo nói về việc Newmark "plans to open a massive manufacturing plant" ở Korden → khai trương nhà máy mới.'),
  p7(173, 'P7-D10', 'What will happen to the old car factories?',
    ['They will be destroyed and rebuilt.', 'They will be the new site of the hydrogen fuel car company.', 'They will be turned into office buildings.', 'They will house all the old conventional cars.'], 'B',
    '"The old Handai facilities will be the site of the new Newmark facilities" → nhà máy ô tô cũ sẽ thành địa điểm của công ty xe chạy hydro.'),
  p7(174, 'P7-D10', 'What is suggested about Korden?',
    ['It will become one of the greenest cities.', 'Its economy will stay stagnant.', 'It will attract new car companies.', 'It will grow economically.'], 'D',
    'Nhà máy dự kiến mang lại 300 việc làm mới và công ty dự báo tăng trưởng mạnh → kinh tế Korden sẽ phát triển. A không có thông tin.'),
  p7(175, 'P7-D10', 'In which of the positions marked [1], [2], [3] and [4] does the following sentence belong? "This is welcome news for a town that has suffered economically after the closure of its car manufacturing plants in the 1990\'s and after its stagnant growth since then."',
    ['[1]', '[2]', '[3]', '[4]'], 'C',
    'Đặt ở [3]: sau tin "mang lại 300 việc làm mới" thì nói "Đây là tin vui cho thị trấn đã khó khăn sau khi các nhà máy ô tô đóng cửa", và câu này dẫn sang câu kế tiếp về cơ sở cũ của Handai (chính là nhà máy ô tô cũ).'),
  p7(176, 'P7-DD01', 'What does Mr. Draper suggest Mr. Brown do?',
    ['Apply for a position', 'Arrange a meeting', 'Make a down payment in April', 'Become a bank member'], 'B',
    '"We advise you to schedule a time to meet with Ms. King" → đề nghị ông Brown sắp xếp một cuộc gặp.'),
  p7(177, 'P7-DD01', 'How is Mr. Brown advised to keep track of his loan?',
    ['By meeting with Mr. Draper', 'By reading a regular e-mail from a bank', 'By using banking services on the Internet', 'By calling a bank hotline'], 'C',
    '"If you sign up for our online banking services, you will be able to quickly and conveniently check on your repayment progress" → theo dõi khoản vay qua ngân hàng trực tuyến.'),
  p7(178, 'P7-DD01', 'What information does the Web page provide?',
    ['Bank account statements', 'Quarterly interest rates', 'Repayment options', 'A roster of members'], 'C',
    'Văn bản thứ hai liệt kê các loại khoản vay mua nhà, mỗi loại có cách trả lãi và gốc khác nhau → các lựa chọn trả nợ.'),
  p7(179, 'P7-DD01', 'What plan is suitable for those with unstable earnings?',
    ['Fixed-Rate Mortgage Loan', 'Adjustable-Rate Mortgage Loan', 'Interest-Only Mortgage Loan', 'Home Opportunity Loan'], 'C',
    'Interest-Only Mortgage Loan: "This option is suitable for those with fluctuating incomes" (thu nhập dao động = không ổn định).'),
  p7(180, 'P7-DD01', 'What is indicated about Mr. Brown?',
    ['He made a large down payment.', 'He earns a steady salary.', 'He recently bought his first home.', 'He will retire in the near future.'], 'C',
    'Kết hợp 2 văn bản: ông Brown vay "Home Opportunity Loan" (email), mà loại này "designed for first-time home buyers" (trang web) → ông vừa mua căn nhà đầu tiên. A sai vì loại vay này không cần đặt cọc lớn.'),
  p7(181, 'P7-DD02', 'According to Ms. Piers, what is true about consumer electronics?',
    ['Their demand is constantly increasing.', 'They are becoming more and more expensive.', 'They will be produced only in a few countries.', "They can affect users' health."], 'A',
    '"the market for consumer electronics continues to become larger and larger globally" → nhu cầu đồ điện tử tiêu dùng tăng liên tục.'),
  p7(182, 'P7-DD02', 'What is Sun Microchips planning to do?',
    ['Launch the latest model of smartphone', 'Build a new factory overseas', 'Give preference to local job candidates', 'Hire a new chief executive officer'], 'C',
    '"the company will try to hire local applicants first" → ưu tiên ứng viên địa phương. B sai: nhà máy mới ở Madison trong nước và đã xây xong.'),
  p7(183, 'P7-DD02', 'Who most likely is Ms. Zimmerman?',
    ['A computer technician', 'A human resource manager', 'A factory worker', 'An accountant'], 'B',
    'Ứng viên gửi hồ sơ xin việc cho Tina Zimmerman và bà sắp xếp lịch phỏng vấn → nhiều khả năng là quản lý nhân sự.'),
  p7(184, 'P7-DD02', 'What is the purpose of the e-mail?',
    ['To quit a job', 'To postpone an appointment', 'To ask for an interview', 'To accept a job offer'], 'C',
    'Ông Henry gửi CV và viết "I would really appreciate it if you would give me a chance to have an interview" → xin được phỏng vấn.'),
  p7(185, 'P7-DD02', 'What can be inferred about Mr. Henry?',
    ['He is a local resident of Madison.', 'He has a degree in computer science.', 'He currently works at Sun Microchips.', 'He wants an office position.'], 'D',
    'Kết hợp 2 văn bản: ông muốn phỏng vấn ngày 10/12 (email); bài báo nói ngày 9–11/12 dành cho vị trí nhân sự, kế toán, chăm sóc khách hàng → ông muốn làm vị trí văn phòng. C sai: ông là "former employee" (nhân viên cũ).'),
  p7(186, 'P7-DB01', 'How does Logan Mankins propose to keep his two groups of 5 golfers from delaying the other golfers on the course?',
    ['He guarantees they will play fast.', 'He promises that they are very good at golf.', 'He writes that he will buy a new putter for his son.', 'He informs the club that the two groups will be driving golf carts.'], 'D',
    '"We will even rent golf carts to ensure that we don\'t cause a delay" → hai nhóm sẽ đi xe điện sân golf để không làm chậm người khác.'),
  p7(187, 'P7-DB01', 'Where would the advertisement most likely appear?',
    ['On television', 'In a magazine', 'In a newspaper', 'On a billboard'], 'C',
    'Ông Choi thiết kế quảng cáo "to grab the attention of newspaper readers", và ông Mankins viết "I saw your ad in the newspaper" → quảng cáo đăng báo. Quảng cáo truyền hình là một quảng cáo khác.'),
  p7(188, 'P7-DB01', 'What has been added to the advertisement?',
    ['Promotional details', 'Driving directions', 'Contact information', 'Customer reviews'], 'C',
    'Ông Choi "added some helpful information to the end of the advertisement". Cuối quảng cáo là website và số điện thoại đặt chỗ → thông tin liên hệ.'),
  p7(189, 'P7-DB01', 'What does Logan Mankins want to do with the $5 credits the members get for the golf shop?',
    ['He wants to buy his son a putter with his own coupon.', 'He wants to use them to pay for green fees.', 'He wants to combine it with the 20% group discount.', 'He wants to combine all of the discounts together and apply it to one purchase.'], 'D',
    'Ông hỏi các phiếu $5 "could be pooled together for one large purchase" → gộp tất cả phiếu lại dùng cho một lần mua (10 người × $5 = $50 để mua gậy putter cho con). A sai vì ông muốn dùng phiếu của cả nhóm, không chỉ phiếu của mình.'),
  p7(190, 'P7-DB01', 'What did The Rolling Meadows Daily indicate about Endless Acres Golf Club?',
    ['The location is convenient.', 'The facilities are well kept.', 'The membership fees are affordable.', 'The restaurant updates its menu regularly.'], 'B',
    '"praised by The Rolling Meadows Daily for the superb maintenance of our golf course and grounds" → sân và khuôn viên được bảo dưỡng rất tốt.'),
  p7(191, 'P7-DB02', 'What is the purpose of the e-mail?',
    ['To introduce new members', 'To promote upcoming events', 'To announce some schedule adjustments', 'To solicit donations'], 'B',
    '"We would like to inform you of some special upcoming events this month" → giới thiệu các sự kiện sắp diễn ra.'),
  p7(192, 'P7-DB02', 'What is indicated about Ebert Butler?',
    ['His wife is an illustrator.', 'He has recently published his first book.', 'He has several cats.', 'He will receive an award soon.'], 'A',
    'Vợ ông, Kathy Butler, "has drawn the pictures in most of Mr. Butler\'s books" → bà là họa sĩ minh họa. D sai: sách chỉ mới được đề cử giải. B sai: bà đã vẽ cho "most of" các sách của ông → ông có nhiều sách.'),
  p7(193, 'P7-DB02', 'According to the Chat Board, what does Donna Ward excel at?',
    ['Creating vivid photographs', 'Writing successful screenplays', 'Understanding the role of timing and storylines', 'Working with young poets'], 'C',
    'Chuck viết "Her knowledge of narrative and pacing" → hiểu biết về cốt truyện (narrative = storylines) và nhịp độ (pacing = timing). Người viết kịch bản là Chuck, không phải Donna (B).'),
  p7(194, 'P7-DB02', 'When can library users meet Kathy Butler?',
    ['On Wednesday', 'On Friday', 'On Saturday', 'On Sunday'], 'D',
    'Kết hợp 2 văn bản: bà Kathy Butler sẽ dự buổi đọc sách The Mysterious Cat (email); theo lịch, buổi này vào "Sunday, Aug. 17" → Chủ nhật.'),
  p7(195, 'P7-DB02', 'What will likely happen after the Creative Writers Workshop on August 2?',
    ['Everyone will know how to write poetry better.', 'Chuck and Jim will exchange their work to give each other feedback.', 'Donna Ward will publish her novel.', "Chuck and Donna will work with Jim's short story."], 'B',
    'Chuck đề nghị đọc truyện ngắn của Jim sau buổi học để góp ý, và cho Jim xem kịch bản của mình → hai người trao đổi bài viết để góp ý cho nhau.'),
  p7(196, 'P7-DB03', "What is indicated about Red Rock Leather Goods' products?",
    ['They are sold nationwide.', 'They are relatively expensive.', 'They are made by hand', 'They come in a variety of colors.'], 'C',
    '"All of our products are individually and meticulously made by skillful craftsmen" → từng sản phẩm được thợ lành nghề làm tỉ mỉ, tức là làm thủ công.'),
  p7(197, 'P7-DB03', 'Why did Ms. Perkins fill out a form?',
    ['To receive a cash refund on a product', 'To report a defective item', 'To file a customer service complaint', 'To extend a warranty contract'], 'B',
    'Bà Perkins viết khóa kéo túi bị kẹt sau 6 tháng và "this is a manufacturing defect" → báo sản phẩm bị lỗi để được sửa. Bà không đòi hoàn tiền (A).'),
  p7(198, 'P7-DB03', 'How much would Ms. Perkins be charged if her item was purchased at a second-hand store?',
    ['$15', '$20', '$30', '$45'], 'C',
    'Kết hợp 2 văn bản: mua ở cửa hàng đồ cũ thì không được bảo hành → phải trả phí. Món đồ là túi xách (Handbag), lỗi khóa kéo (Zipper repair) → bảng giá: $30.'),
  p7(199, 'P7-DB03', 'In the letter to Melisa Perkins, the word "patronage" is closest in meaning to',
    ['Marketing', 'Business', 'Competition', 'Investment'], 'B',
    '"thank you for your 12 years of patronage" = cảm ơn bà đã ủng hộ, mua hàng suốt 12 năm. "patronage" (sự ủng hộ của khách hàng) gần nghĩa nhất với "business" (việc mua bán, giao dịch).'),
  p7(200, 'P7-DB03', 'What can you infer from the letter to Melisa Perkins approving her request for warranty coverage?',
    ['It was a manufacture defect.', 'Red Rock Leather Goods is a quality brand.', 'Melisa Perkins included her receipt of sale from an authorized Red Rock Leather Goods store.', 'Melisa Perkins included $30 for zipper repair to her Coco TX Handbag.'], 'C',
    'Văn bản 1: bảo hành bắt buộc có hóa đơn mua hàng và chỉ áp dụng cho hàng mua ở đại lý chính hãng. Văn bản 3: công ty đã kiểm tra "item and documents" và chấp nhận bảo hành → suy ra bà đã gửi kèm hóa đơn mua tại cửa hàng Red Rock chính hãng. D sai vì được bảo hành thì không phải trả tiền.'),
];

module.exports = {
  code: 'READING-01',
  title: 'TOEIC Reading – Đề 1',
  durationMinutes: 180,
  showAnswersAfter: true,
  note: 'Đề Reading Part 5–7 (câu 101–200). Nạp bằng lệnh seed.',
  content: { examType: 'TOEIC_LR', audio: { full: null, parts: {} }, groups, questions },
};
