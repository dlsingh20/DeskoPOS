import React from 'react';
import { usePOS } from '../../../context/POSContext';
import {
  Box,
  VStack,
  HStack,
  Text,
  useColorModeValue,
  Select,
} from '@chakra-ui/react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

const RevenueChart = ({ data, minimal = false }) => {
  const { formatPrice } = usePOS();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const gridColor = useColorModeValue('#e0e0e0', '#444');
  
  const [chartType, setChartType] = React.useState('line');
  
  if (!data || !data.breakdown) return null;
  
  // Prepare hourly data for chart
  const hourlyData = data.breakdown.hourlyDistribution.map((count, hour) => ({
    hour: formatHour(hour),
    orders: count,
    revenue: count * (data.summary.averageOrderValue || 0),
  }));
  
  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
  
  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Box
          bg={bg}
          p={3}
          borderRadius="md"
          borderWidth="1px"
          borderColor={borderColor}
          boxShadow="lg"
        >
          <Text fontSize="sm" fontWeight="bold" mb={1}>
            {label}
          </Text>
          {payload.map((entry, index) => (
            <HStack key={index} spacing={2}>
              <Box w={2} h={2} bg={entry.color} borderRadius="full" />
              <Text fontSize="xs" color={textColor}>
                {entry.name}: {entry.name === 'revenue' ? formatPrice(entry.value) : entry.value}
              </Text>
            </HStack>
          ))}
        </Box>
      );
    }
    return null;
  };
  
  // Render chart based on type
  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="hour" stroke={textColor} fontSize={12} />
              <YAxis stroke={textColor} fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="orders" fill="#8884d8" name="Orders" />
              <Bar dataKey="revenue" fill="#82ca9d" name="Revenue ($)" />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="hour" stroke={textColor} fontSize={12} />
              <YAxis stroke={textColor} fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stackId="1"
                stroke="#82ca9d"
                fill="#82ca9d"
                fillOpacity={0.6}
                name="Revenue ($)"
              />
              <Area
                type="monotone"
                dataKey="orders"
                stackId="2"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.6}
                name="Orders"
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        const pieData = Object.entries(data.breakdown.orderTypes || {}).map(([type, count]) => ({
          name: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: count,
        }));
        
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      
      default: // line chart
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hourlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="hour" stroke={textColor} fontSize={12} />
              <YAxis stroke={textColor} fontSize={12} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="#8884d8"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 8 }}
                name="Orders"
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#82ca9d"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 8 }}
                name="Revenue ($)"
              />
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };
  
  // If minimal mode, return just the chart
  if (minimal) {
    return renderChart();
  }
  
  // Otherwise return full card
  return (
    <Box
      bg={bg}
      borderRadius="xl"
      borderWidth="1px"
      borderColor={borderColor}
      p={6}
      boxShadow="sm"
    >
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between">
          <HStack spacing={2}>
            <Icon as={TrendingUp} boxSize={5} color="pos.500" />
            <Text fontSize="lg" fontWeight="bold" color={textColor}>
              Revenue Analytics
            </Text>
          </HStack>
          <Select
            size="sm"
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            width="150px"
          >
            <option value="line">Line Chart</option>
            <option value="bar">Bar Chart</option>
            <option value="area">Area Chart</option>
            <option value="pie">Order Types</option>
          </Select>
        </HStack>
        
        {renderChart()}
      </VStack>
    </Box>
  );
};

// Helper functions
const formatHour = (hour) => {
  if (hour === 0) return '12AM';
  if (hour === 12) return '12PM';
  if (hour < 12) return `${hour}AM`;
  return `${hour - 12}PM`;
};

const renderCustomizedLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent
}) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize="12"
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// Icon component wrapper
const Icon = ({ as: Component, ...props }) => {
  return <Box as={Component} {...props} />;
};

export default RevenueChart;