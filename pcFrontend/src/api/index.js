import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
})

api.interceptors.response.use(r => r.data)

export default api
