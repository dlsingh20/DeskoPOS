import React from 'react';
import { Box, useColorModeValue } from '@chakra-ui/react';

const TimelineGrid = ({ width, timeRange, currentTime }) => {
  const gridColor = useColorModeValue('gray.200', 'gray.700');
  const gridColorLight = useColorModeValue('gray.100', 'gray.800');
  
  // Generate vertical lines for time intervals (every 15 minutes)
  const generateTimeLines = () => {
    const lines = [];
    const intervals = timeRange / 15; // Number of 15-minute intervals
    
    for (let i = 0; i <= intervals; i++) {
      const position = (i * 15 / timeRange) * 100;
      const isMajor = i % 4 === 0; // Every hour is a major line
      
      lines.push(
        <Box
          key={i}
          position="absolute"
          left={`${position}%`}
          top={0}
          bottom={0}
          w={isMajor ? "2px" : "1px"}
          bg={isMajor ? gridColor : gridColorLight}
          opacity={isMajor ? 0.5 : 0.3}
          zIndex={1}
        />
      );
    }
    
    return lines;
  };
  
  // Generate horizontal lines for rows
  const generateRowLines = () => {
    const lines = [];
    const numRows = 10; // Maximum expected rows
    
    for (let i = 0; i < numRows; i++) {
      lines.push(
        <Box
          key={i}
          position="absolute"
          left={0}
          right={0}
          top={`${50 + i * 150}px`} // 50px offset for header, 150px per row
          h="1px"
          bg={gridColorLight}
          opacity={0.2}
          zIndex={1}
        />
      );
    }
    
    return lines;
  };
  
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      pointerEvents="none"
    >
      {/* Vertical time lines */}
      {generateTimeLines()}
      
      {/* Horizontal row lines */}
      {generateRowLines()}
      
      {/* Background gradient for time progression */}
      <Box
        position="absolute"
        top={0}
        bottom={0}
        left={0}
        w="20%"
        bgGradient={useColorModeValue(
          "linear(to-r, green.50, transparent)",
          "linear(to-r, green.900, transparent)"
        )}
        opacity={0.3}
        zIndex={0}
      />
      
      {/* Danger zone gradient (orders older than 30 minutes) */}
      <Box
        position="absolute"
        top={0}
        bottom={0}
        right={0}
        w="60%"
        bgGradient={useColorModeValue(
          "linear(to-l, red.50, transparent)",
          "linear(to-l, red.900, transparent)"
        )}
        opacity={0.2}
        zIndex={0}
      />
    </Box>
  );
};

export default TimelineGrid;