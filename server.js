const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

async function searchSnkrdunk(keyword) {
    const url = `https://snkrdunk.com/search?keywords=${encodeURIComponent(keyword)}&slide=right`;
    const { data: html } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
        },
        timeout: 10000
    });

    const $ = cheerio.load(html);
    const nextDataRaw = $('#__NEXT_DATA__').html();
    if (!nextDataRaw) return [];

    const nextData = JSON.parse(nextDataRaw);
    const pageProps = nextData?.props?.pageProps || {};
    return pageProps?.searchResult?.items || pageProps?.items || [];
}

async function fetchCardPrices(query) {
    try {
        const items = await searchSnkrdunk(query);
        
        const rawCard = items.find(item => {
            const title = (item.name || item.title || '').toUpperCase();
            return !title.includes('PSA') && !title.includes('BGS') && !title.includes('ARS') && !title.includes('CGC');
        });

        let psa10Card = items.find(item => {
            const title = (item.name || item.title || '').toUpperCase();
            return title.includes('PSA10') || title.includes('PSA 10');
        });

        if (!psa10Card) {
            await new Promise(r => setTimeout(r, 400));
            const psaItems = await searchSnkrdunk(`${query} PSA10`);
            psa10Card = psaItems.find(item => {
                const title = (item.name || item.title || '').toUpperCase();
                return title.includes('PSA10') || title.includes('PSA 10');
            });
        }

        if (!rawCard && !psa10Card) {
            return { query, status: 'not_found', message: '搵唔到對應卡牌' };
        }

        const baseCard = rawCard || psa10Card;

        return {
            query,
            status: 'ok',
            name: baseCard.name || baseCard.title,
            image: baseCard.imageUrl || baseCard.image || '',
            raw: rawCard ? {
                priceJpy: rawCard.minPrice || rawCard.price || 0,
                url: `https://snkrdunk.com/products/${rawCard.id || rawCard.productId}`
            } : null,
            psa10: psa10Card ? {
                priceJpy: psa10Card.minPrice || psa10Card.price || 0,
                url: `https://snkrdunk.com/products/${psa10Card.id || psa10Card.productId}`
            } : null
        };

    } catch (error) {
        return { query, status: 'error', message: `抓取失敗: ${error.message}` };
    }
}

app.post('/api/batch-price', async (req, res) => {
    const { cards } = req.body;
    if (!Array.isArray(cards)) return res.status(400).json({ error: '格式錯誤' });

    const results = [];
    for (const card of cards) {
        const cleanQuery = card.trim();
        if (!cleanQuery) continue;

        const data = await fetchCardPrices(cleanQuery);
        results.push(data);
        await new Promise(resolve => setTimeout(resolve, 600));
    }

    res.json({ results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});