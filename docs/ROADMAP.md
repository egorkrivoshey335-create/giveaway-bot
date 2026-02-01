# RandomBeast — Product Roadmap

> **Version:** 0.1.0 (MVP Planning)  
> **Last Updated:** 2026-01-22

---

## 1. Vision

**RandomBeast** — лучший инструмент для честных розыгрышей в Telegram с прозрачной верификацией условий и защитой от накруток.

**Ключевые отличия:**
- Честный рандом с доказательством
- Мощная анти-фрод система
- Удобный UI в Mini App
- Каталог розыгрышей для участников

---

## 2. MVP (Phase 1) — 8 недель

### 2.1 Core Features

| Feature | Priority | Status | Notes |
|---------|----------|--------|-------|
| User authentication (TMA) | P0 | 🔲 | Init data validation |
| Channel management | P0 | 🔲 | Add/verify/permissions |
| Basic giveaway creation | P0 | 🔲 | Title, dates, winners |
| Subscription conditions | P0 | 🔲 | Check via getChatMember |
| Random winner selection | P0 | 🔲 | Cryptographic random |
| Post publishing | P0 | 🔲 | To multiple channels |
| Results announcement | P0 | 🔲 | Separate post / edit |
| i18n (ru/en) | P0 | 🔲 | Bot + Mini App |

### 2.2 Bot Commands

```
/start - Welcome + main menu
/new - Create giveaway wizard
/my - My giveaways list
/channels - Channel management
/lang - Language selection
/help - Help & FAQ
```

### 2.3 Mini App Screens

```
/ - Dashboard (my giveaways)
/new - Giveaway creation wizard
/giveaway/:id - Giveaway details
/giveaway/:id/edit - Edit giveaway
/channels - Channel management
/settings - User settings
```

### 2.4 Technical Foundation

- [x] Project constitution (docs)
- [x] Shared types & constants
- [ ] Monorepo setup (Turborepo)
- [ ] Database schema (Prisma)
- [ ] API skeleton (Fastify)
- [ ] Bot skeleton (grammY)
- [ ] Web skeleton (Next.js)
- [ ] CI/CD pipeline
- [ ] Staging environment

### 2.5 MVP Deliverables

**Week 1-2:** Infrastructure
- Monorepo setup
- Database schema
- API auth middleware
- Bot webhook setup

**Week 3-4:** Core Entities
- User management
- Channel management
- Giveaway CRUD

**Week 5-6:** Business Logic
- Participation flow
- Condition verification
- Winner selection

**Week 7-8:** Polish & Launch
- Mini App UI
- Bot UX improvements
- Testing
- Soft launch

---

## 3. Phase 2 — Enhanced Features (4 недели)

### 3.1 Extended Conditions

| Feature | API Support | Implementation |
|---------|-------------|----------------|
| Boost verification | ✅ getUserChatBoosts | Full support |
| Invite tracking | ⚠️ startapp param | Via referral links |
| Custom tasks | N/A | Click tracking only |
| Stories repost | ❌ No API | **NOT POSSIBLE** |

### 3.2 Media Support

- [ ] Photo attachments
- [ ] Video attachments
- [ ] MediaAdapter with reupload logic
- [ ] Preview in Mini App

### 3.3 Kazakh Language

- [ ] kk.json translations
- [ ] RTL consideration (not needed)
- [ ] Regional date formats

### 3.4 Draft & Auto-save

- [ ] Server-side draft storage
- [ ] Auto-save every 30 seconds
- [ ] Resume wizard prompt
- [ ] "Data saved" modal on exit

---

## 4. Phase 3 — Monetization (4 недели)

### 4.1 Catalog Feature

**Concept:** Публичный каталог активных розыгрышей для участников.

```
/catalog - Browse giveaways
/catalog/:id - Giveaway landing page
```

**Monetization:**
- Платная подписка для организаторов
- Продукт: `CATALOG_MONTHLY_1000` (1000 ₽/мес)
- Entitlement: `catalog.access`

### 4.2 Payment Integration (YooKassa)

- [ ] YooKassa API integration
- [ ] Checkout flow in Mini App
- [ ] Webhook handling
- [ ] Receipt generation
- [ ] Subscription management

### 4.3 Entitlements System

```typescript
// MVP Entitlements
catalog.access      // Показ в каталоге
liveness.check      // Проверка "живости" (будущее)
analytics.advanced  // Расширенная статистика (будущее)
```

---

## 5. Phase 4 — Anti-Fraud (4 недели)

### 5.1 Basic Protection

- [ ] Fraud score calculation
- [ ] Account age check
- [ ] Participation velocity limits
- [ ] IP-based rate limiting

### 5.2 Captcha System

| Mode | Trigger | Type |
|------|---------|------|
| OFF | Never | - |
| SUSPICIOUS_ONLY | fraudScore > 30 | Simple/Complex |
| ALL | Always | Simple |

- [ ] Simple captcha (button click with delay)
- [ ] Complex captcha (math problem)
- [ ] Integration in join flow

### 5.3 Manual Moderation (Future)

- [ ] Flag suspicious participants
- [ ] Batch ban functionality
- [ ] Appeal system

---

## 6. Phase 5 — Analytics & Growth (ongoing)

### 6.1 Creator Analytics

- Participation dynamics chart
- Traffic sources breakdown
- Conversion funnel
- Winner demographics

### 6.2 Participant Features

- Giveaway history
- Win statistics
- Notifications for new giveaways

### 6.3 Marketing Site

```
randombeast.ru
├── / - Landing page
├── /features - Feature showcase
├── /pricing - Pricing plans
├── /winners - Public winner announcements
└── /blog - Content marketing
```

---

## 7. Future Considerations

### 7.1 Potential Features (Backlog)

| Feature | Complexity | Priority |
|---------|------------|----------|
| Multi-admin support | Medium | Low |
| API for integrations | High | Low |
| Telegram Stars payments | Medium | Medium |
| Scheduled posts | Low | Medium |
| A/B testing for posts | High | Low |
| Referral program | Medium | Medium |

### 7.2 Known Limitations

| Limitation | Workaround |
|------------|------------|
| Stories verification | Document as unavailable |
| Precise invite tracking | Use startapp param |
| Real-time participant count | Polling / webhooks |
| Bot in private chats only | Documented behavior |

### 7.3 Technical Debt Prevention

- Regular dependency updates
- Code review requirements
- Test coverage > 60%
- Documentation updates with features

---

## 8. Success Metrics

### 8.1 MVP Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Giveaways created | 100 | First month |
| Active users | 500 | First month |
| Avg. participants/giveaway | 50 | - |
| Error rate | < 1% | Sentry |
| API latency p95 | < 500ms | Monitoring |

### 8.2 Growth Targets (6 months)

| Metric | Target |
|--------|--------|
| Monthly active creators | 1,000 |
| Monthly active participants | 50,000 |
| Paid subscribers | 50 |
| MRR | 50,000 ₽ |

---

## 9. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Telegram API changes | Medium | High | Abstract API calls, monitor changelogs |
| YooKassa integration issues | Low | Medium | Test thoroughly, have support contact |
| Fraud/abuse | High | Medium | Anti-fraud from Phase 4 |
| Competitor copying | Medium | Low | Focus on UX, speed to market |
| Scaling issues | Low | High | Redis caching, DB optimization |

---

## 10. Team & Resources

### 10.1 MVP Team

- 1 Full-stack developer
- 1 Designer (part-time)
- 1 QA (part-time)

### 10.2 Infrastructure Costs (estimated)

| Service | Monthly Cost |
|---------|-------------|
| VPS (API + Bot) | 2,000 ₽ |
| Managed PostgreSQL | 3,000 ₽ |
| Redis | 1,000 ₽ |
| Domain + SSL | 500 ₽ |
| Sentry | Free tier |
| **Total** | **~6,500 ₽** |

---

## 11. Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-22 | 0.1.0 | Initial constitution, MVP planning |
