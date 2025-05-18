import request from 'supertest';
import app from '../src/server';

describe('API Routes', () => {
  test('GET /api/traders should return trader data', async () => {
    const res = await request(app).get('/api/traders');
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });
  
  // Add more tests as needed
});